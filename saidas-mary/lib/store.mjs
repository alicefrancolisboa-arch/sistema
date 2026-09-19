
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { PRICE, date, dueDate, today } from './dates.mjs';
export const norm = s => s.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
export function str(s,label,max=100) { if(typeof s!=='string'||!s.trim()||s.trim().length>max) throw Error(label+' inválido.'); return s.trim(); }
export function integer(n,min,max,label) { if(!Number.isSafeInteger(n)||n<min||n>max) throw Error(label+' inválido.'); return n; }
export class Store {
 constructor(path) {
  this.db=new DatabaseSync(path);
  this.db.exec(`
   PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
   CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY,name TEXT NOT NULL,normalized TEXT NOT NULL UNIQUE,phone TEXT NOT NULL DEFAULT '');
   CREATE TABLE IF NOT EXISTS sales(id TEXT PRIMARY KEY,customer TEXT NOT NULL REFERENCES customers(id),qty INTEGER NOT NULL CHECK(qty>0),purchased TEXT NOT NULL,due TEXT NOT NULL,source TEXT NOT NULL,created TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY,customer TEXT NOT NULL REFERENCES customers(id),cents INTEGER NOT NULL CHECK(cents>0),paid TEXT NOT NULL,created TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS sheets(id TEXT PRIMARY KEY,name TEXT NOT NULL,due TEXT NOT NULL,created TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS totals(sheet TEXT NOT NULL REFERENCES sheets(id),customer TEXT NOT NULL REFERENCES customers(id),qty INTEGER NOT NULL CHECK(qty>=0),PRIMARY KEY(sheet,customer));
   CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY,hash TEXT NOT NULL UNIQUE,sheet TEXT NOT NULL REFERENCES sheets(id),created TEXT NOT NULL,rows TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1),extra TEXT NOT NULL);
   INSERT OR IGNORE INTO settings VALUES(1,'[]');
   CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,result TEXT NOT NULL);
  `);
 }
 all(sql,...args){return this.db.prepare(sql).all(...args);}
 one(sql,...args){return this.db.prepare(sql).get(...args);}
 run(sql,...args){return this.db.prepare(sql).run(...args);}
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 idempotent(id,fn){
  str(id,'Identificador',100);
  return this.transaction(()=>{const old=this.one('SELECT result FROM operations WHERE id=?',id);if(old)return JSON.parse(old.result);const result=fn();this.run('INSERT INTO operations VALUES(?,?)',id,JSON.stringify(result));return result;});
 }
 get extras(){return JSON.parse(this.one('SELECT extra FROM settings WHERE id=1').extra);}
 setExtras(values){
  if(!Array.isArray(values)||values.length>150)throw Error('Lista de feriados inválida.');
  values.forEach(date);this.run('UPDATE settings SET extra=? WHERE id=1',JSON.stringify([...new Set(values)]));
  return {ok:true};
 }
 customer(id){const c=this.one('SELECT * FROM customers WHERE id=?',str(id,'Cliente'));if(!c)throw Error('Cliente não encontrado.');return c;}
 saveCustomer({id,name,phone=''}) {
  name=str(name,'Nome',80);phone=String(phone).replace(/\D/g,'');
  if(phone && !/^(?:55)?\d{10,11}$/.test(phone))throw Error('Informe telefone com DDD (10 ou 11 dígitos).');
  if(phone.length===10||phone.length===11)phone='55'+phone;
  const existing=this.one('SELECT id FROM customers WHERE normalized=?',norm(name));
  if(existing && existing.id!==id)throw Error('Esse nome já existe. Use um sobrenome ou apelido para diferenciar.');
  if(id){this.customer(id);this.run('UPDATE customers SET name=?,normalized=?,phone=? WHERE id=?',name,norm(name),phone,id);}
  else{id=randomUUID();this.run('INSERT INTO customers VALUES(?,?,?,?)',id,name,norm(name),phone);}
  return this.customer(id);
 }
 sale({customer,qty,purchased,operation}){
  return this.idempotent(operation,()=>{
   this.customer(customer);integer(qty,1,10000,'Quantidade');date(purchased);
   if(purchased>today())throw Error('A venda não pode ter uma data futura.');
   const row={id:randomUUID(),customer,qty,purchased,due:dueDate(purchased,this.extras),source:'manual',created:new Date().toISOString()};
   this.run('INSERT INTO sales VALUES(?,?,?,?,?,?,?)',...Object.values(row));return row;
  });
 }
 balances(cutoff='9999-12-31') {
  const sales=this.all('SELECT * FROM sales ORDER BY due,created,id'),payments=this.all('SELECT * FROM payments');
  const paid=new Map();for(const p of payments)paid.set(p.customer,(paid.get(p.customer)||0)+p.cents);
  const remaining=[];
  for(const s of sales){const total=s.qty*PRICE,used=Math.min(total,paid.get(s.customer)||0);paid.set(s.customer,(paid.get(s.customer)||0)-used);if(s.due<=cutoff)remaining.push({...s,cents:total-used});}
  return remaining;
 }
 payment({customer,cents,paid,operation}) {
  return this.idempotent(operation,()=>{
   this.customer(customer);integer(cents,1,100000000,'Valor');date(paid);
   if(paid>today())throw Error('O pagamento não pode ter uma data futura.');
   const balance=this.balances().filter(s=>s.customer===customer).reduce((a,s)=>a+s.cents,0);
   if(cents>balance)throw Error('O pagamento é maior que o saldo pendente.');
   const row={id:randomUUID(),customer,cents,paid,created:new Date().toISOString()};
   this.run('INSERT INTO payments VALUES(?,?,?,?,?)',...Object.values(row));return row;
  });
 }
 undoPayment(id){if(!this.one('SELECT id FROM payments WHERE id=?',id))throw Error('Pagamento não encontrado.');this.run('DELETE FROM payments WHERE id=?',id);return {ok:true};}
 createSheet({name,purchased}){
  name=str(name,'Nome da folha',80);date(purchased);if(purchased>today())throw Error('Use a data das compras já realizadas.');
  const due=dueDate(purchased,this.extras);
  if(this.one('SELECT id FROM sheets WHERE name=? AND due=?',name,due))throw Error('Já existe uma folha com esse nome e vencimento. Selecione a folha existente.');
  const row={id:randomUUID(),name,due,created:new Date().toISOString()};
  this.run('INSERT INTO sheets VALUES(?,?,?,?)',...Object.values(row));return row;
 }
 sheet(id){const s=this.one('SELECT * FROM sheets WHERE id=?',str(id,'Folha'));if(!s)throw Error('Folha não encontrada.');return s;}
 totals(sheet){return this.all('SELECT customer,qty FROM totals WHERE sheet=?',sheet);}
 imported(hash){return this.one('SELECT id FROM imports WHERE hash=?',hash);}
 commit({sheet,hash,rows,purchased,operation,reviewed}){
  return this.idempotent(operation,()=>{
   if(reviewed!==true)throw Error('Confira a foto, os clientes e os totais antes de confirmar.');
   const page=this.sheet(sheet);date(purchased);if(purchased>today())throw Error('A data não pode estar no futuro.');
   if(dueDate(purchased,this.extras)!==page.due)throw Error('A data das compras pertence a outro vencimento. Use outra folha.');
   if(!/^[a-f0-9]{64}$/.test(hash))throw Error('Identificador da imagem inválido.');
   if(this.imported(hash))throw Error('Esta imagem já foi contabilizada.');
   if(!Array.isArray(rows)||!rows.length||rows.length>200)throw Error('Confira as linhas da folha.');
   const seen=new Set(),saved=[];let added=0;
   for(const row of rows){
    let customer=row.customer;
    if(!customer){
     const name=str(row.name,'Nome do cliente',80);
     const existing=this.one('SELECT id FROM customers WHERE normalized=?',norm(name));
     if(existing)throw Error('Selecione o cadastro existente de '+name+' antes de confirmar.');
     customer=this.saveCustomer({name}).id;
    } else this.customer(customer);
    if(seen.has(customer))throw Error('Um cliente está repetido na revisão. Some os risquinhos dele em uma única linha.');
    seen.add(customer);integer(row.total,0,10000,'Total de risquinhos');
    const before=this.one('SELECT qty FROM totals WHERE sheet=? AND customer=?',sheet,customer)?.qty||0;
    if(row.previous!==before)throw Error('Esta folha foi atualizada em outra janela. Leia a foto novamente.');
    if(row.total<before)throw Error('O total ficou menor que o já registrado. Confira a leitura ou selecione uma nova folha.');
    const delta=row.total-before;added+=delta;
    if(delta)this.run('INSERT INTO sales VALUES(?,?,?,?,?,?,?)',randomUUID(),customer,delta,purchased,page.due,sheet,new Date().toISOString());
    this.run('INSERT INTO totals VALUES(?,?,?) ON CONFLICT(sheet,customer) DO UPDATE SET qty=excluded.qty',sheet,customer,row.total);
    saved.push({customer,before,total:row.total,added:delta});
   }
   const id=randomUUID();
   this.run('INSERT INTO imports VALUES(?,?,?,?,?)',id,hash,sheet,new Date().toISOString(),JSON.stringify(saved));
   return {id,added,cents:added*PRICE};
  });
 }
 snapshot(){
  return {customers:this.all('SELECT id,name,phone FROM customers ORDER BY name COLLATE NOCASE'),
   sales:this.all('SELECT * FROM sales ORDER BY created DESC'),payments:this.all('SELECT * FROM payments ORDER BY created DESC'),
   sheets:this.all('SELECT * FROM sheets ORDER BY created DESC'),totals:this.all('SELECT * FROM totals'),
   imports:this.all('SELECT * FROM imports ORDER BY created DESC'),extraHolidays:this.extras,balances:this.balances(),today:today()};
 }
 backup(){return {format:'casa-do-acai',version:1,created:new Date().toISOString(),tables:Object.fromEntries(['customers','sales','payments','sheets','totals','imports','settings','operations'].map(t=>[t,this.all('SELECT * FROM '+t)]))};}
 restore(payload) {
  if(payload?.format!=='casa-do-acai'||payload.version!==1||!payload.tables)throw Error('Arquivo de backup inválido.');
  const columns={customers:['id','name','normalized','phone'],sales:['id','customer','qty','purchased','due','source','created'],payments:['id','customer','cents','paid','created'],sheets:['id','name','due','created'],totals:['sheet','customer','qty'],imports:['id','hash','sheet','created','rows'],settings:['id','extra'],operations:['id','result']};
  const t=payload.tables;
  for(const name of Object.keys(columns)){if(!Array.isArray(t[name])||t[name].length>100000)throw Error('Backup inválido.');}
  if(t.settings.length!==1 || t.settings[0].id!==1)throw Error('Configuração inválida.');
  const extras=JSON.parse(t.settings[0].extra);if(!Array.isArray(extras)||extras.length>150)throw Error('Feriados inválidos.');extras.forEach(date);
  for(const c of t.customers){str(c.name,'Nome',80);if(c.normalized!==norm(c.name)||!/^$|^55\d{10,11}$/.test(c.phone))throw Error('Cadastro inválido no backup.');}
  for(const s of t.sales){integer(s.qty,1,10000,'Quantidade');date(s.purchased);date(s.due);}
  for(const p of t.payments){integer(p.cents,1,100000000,'Valor');date(p.paid);}
  for(const s of t.sheets){str(s.name,'Folha',80);date(s.due);}
  for(const s of t.totals)integer(s.qty,0,10000,'Total');
  return this.transaction(()=>{
   for(const name of ['operations','imports','totals','payments','sales','sheets','customers','settings'])this.db.exec('DELETE FROM '+name);
   for(const [name,cols] of Object.entries(columns)){
    const insert=this.db.prepare('INSERT INTO '+name+'('+cols.join(',')+') VALUES('+cols.map(()=>'?').join(',')+')');
    for(const row of t[name]){
     const vals=cols.map(c=>row[c]);if(vals.some(v=>!['string','number'].includes(typeof v)))throw Error('Backup com campos inválidos.');
     insert.run(...vals);
    }
   }
   for(const c of t.customers){
    const sold=this.one('SELECT COALESCE(SUM(qty),0)*1000 AS value FROM sales WHERE customer=?',c.id).value;
    const paid=this.one('SELECT COALESCE(SUM(cents),0) AS value FROM payments WHERE customer=?',c.id).value;
    if(paid>sold)throw Error('Backup com pagamento maior que as vendas.');
   }
   return {ok:true};
  });
 }
 close(){this.db.close();}
}
