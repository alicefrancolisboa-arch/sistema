
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {date,dueDate,fifthBusinessDay,reminders,holidays} from '../lib/dates.mjs';
import {Store} from '../lib/store.mjs';
const use=(t)=>{const s=new Store(':memory:');t.after(()=>s.close());return s;};
const op=()=>randomUUID();
const hash=n=>String(n).padStart(64,'0');
function setup(t){const s=use(t),c=s.saveCustomer({name:'Maria Silva',phone:'19999999999'}),sheet=s.createSheet({name:'Folha agosto',purchased:'2026-08-18'});return {s,c,sheet};}
function commit(s,c,sheet,total,previous,n=1,extra=0){return s.commit({sheet:sheet.id,hash:hash(n),purchased:'2026-08-18',operation:op(),reviewed:true,rows:[{customer:c.id,total,previous,extra,matchConfirmed:true}]});}
test('dia 19 fecha no 20 e dia 20 muda para quinto útil',()=>{
 assert.equal(dueDate('2026-09-19'),'2026-09-20');
 assert.equal(dueDate('2026-09-20'),'2026-10-07');
 assert.equal(dueDate('2026-09-30'),'2026-10-07');
 assert.equal(dueDate('2026-10-01'),'2026-10-20');
});
test('virada do ano e feriado de janeiro',()=>assert.equal(dueDate('2026-12-20'),'2027-01-08'));
test('sábado, domingo, Corpus Christi e feriado de Piracicaba são excluídos',()=>{
 assert.equal(fifthBusinessDay(2026,6),'2026-06-08');
 assert.equal(fifthBusinessDay(2026,12),'2026-12-07');
 assert.equal(fifthBusinessDay(2025,12),'2025-12-05');
 assert.ok(holidays(2026).has('2026-06-13'));
 assert.ok(holidays(2026).has('2026-12-08'));
 assert.equal(fifthBusinessDay(2026,9),'2026-09-08');
 assert.equal(fifthBusinessDay(2026,1),'2026-01-08');
});
test('feriado adicional afeta cálculo mas não altera vencimentos salvos',t=>{
 const {s,c}=setup(t);const sale=s.sale({customer:c.id,qty:1,purchased:'2026-05-20',operation:op()});
 assert.equal(sale.due,'2026-06-08');s.setExtras(['2026-06-05']);
 assert.equal(dueDate('2026-05-20',s.extras),'2026-06-09');assert.equal(s.snapshot().sales[0].due,'2026-06-08');
});
test('listas nos dias 18,19 e véspera de quinto útil (inclusive domingo)',()=>{
 assert.equal(reminders('2026-09-18')[0].due,'2026-09-20');
 assert.equal(reminders('2026-09-19')[0].due,'2026-09-20');
 assert.equal(reminders('2026-06-07')[0].due,'2026-06-08');
 assert.deepEqual(reminders('2026-09-17'),[]);
});
test('datas impossíveis são rejeitadas',()=>{for(const d of ['2026-02-30','abc','2026-13-01','2026-1-2'])assert.throws(()=>date(d));});
test('cadastro normaliza acentos e evita homônimo acidental',t=>{
 const s=use(t);s.saveCustomer({name:'José Silva'});
 assert.throws(()=>s.saveCustomer({name:' jose   SILVA '}),/já existe/);
 assert.throws(()=>s.saveCustomer({name:'A',phone:'123'}),/telefone/);
});
test('venda é idempotente e não aceita fração nem quantidade negativa',t=>{
 const {s,c}=setup(t),operation=op(),input={customer:c.id,qty:3,purchased:'2026-08-19',operation};
 assert.equal(s.sale(input).id,s.sale(input).id);assert.equal(s.snapshot().sales.length,1);
 assert.throws(()=>s.sale({...input,qty:1.5,operation:op()}),/Quantidade/);
 assert.throws(()=>s.sale({...input,qty:-1,operation:op()}),/Quantidade/);
});
test('pagamento parcial abate vencimento mais antigo sem incluir futuro na cobrança',t=>{
 const {s,c}=setup(t);s.sale({customer:c.id,qty:3,purchased:'2026-08-19',operation:op()});s.sale({customer:c.id,qty:2,purchased:'2026-08-20',operation:op()});
 const p=s.payment({customer:c.id,cents:1500,paid:'2026-08-21',operation:op()});
 assert.equal(s.balances('2026-08-20').reduce((n,x)=>n+x.cents,0),1500);
 assert.equal(s.balances().reduce((n,x)=>n+x.cents,0),3500);
 assert.throws(()=>s.payment({customer:c.id,cents:9999,paid:'2026-08-21',operation:op()}),/maior/);
 s.undoPayment(p.id);assert.equal(s.balances().reduce((n,x)=>n+x.cents,0),5000);
});
test('pagamento repetido não abate duas vezes',t=>{
 const {s,c}=setup(t);s.sale({customer:c.id,qty:3,purchased:'2026-08-19',operation:op()});
 const input={customer:c.id,cents:1000,paid:'2026-08-20',operation:op()};
 assert.equal(s.payment(input).id,s.payment(input).id);assert.equal(s.snapshot().payments.length,1);
});
test('primeira foto soma total; próxima soma somente diferença',t=>{
 const {s,c,sheet}=setup(t);assert.equal(commit(s,c,sheet,3,0).added,3);assert.equal(commit(s,c,sheet,5,3,2).added,2);
 assert.equal(s.balances().reduce((n,x)=>n+x.cents,0),5000);
});
test('operadora corrige riscos novos que a leitura não contou sem duplicar o saldo anterior',t=>{
 const {s,c,sheet}=setup(t);assert.equal(commit(s,c,sheet,8,0,1).added,8);
 const result=commit(s,c,sheet,8,8,2,3);
 assert.equal(result.added,3);assert.equal(s.snapshot().totals[0].qty,11);
 assert.equal(s.snapshot().sales.reduce((sum,sale)=>sum+sale.qty,0),11);
 assert.equal(s.balances().reduce((sum,row)=>sum+row.cents,0),11000);
});
test('mesma foto e foto sem risquinhos novos nunca duplicam dívida',t=>{
 const {s,c,sheet}=setup(t);commit(s,c,sheet,3,0);assert.throws(()=>commit(s,c,sheet,3,3),/já foi/);
 assert.equal(commit(s,c,sheet,3,3,2).added,0);assert.equal(s.snapshot().sales.length,1);
});
test('mesma imagem é bloqueada também em outra folha',t=>{
 const {s,c,sheet}=setup(t);commit(s,c,sheet,3,0);
 const second=s.createSheet({name:'Outra folha',purchased:'2026-08-18'});
 assert.throws(()=>commit(s,c,second,3,0),/já foi/);
});
test('leitura menor ou desatualizada é rejeitada',t=>{
 const {s,c,sheet}=setup(t);commit(s,c,sheet,3,0);
 assert.throws(()=>commit(s,c,sheet,2,3,2),/menor/);
 assert.throws(()=>commit(s,c,sheet,4,0,3),/outra janela/);
 assert.equal(s.snapshot().imports.length,1);
});
test('foto sem revisão e período errado são rejeitados',t=>{
 const {s,c,sheet}=setup(t);
 const p={sheet:sheet.id,hash:hash(1),purchased:'2026-08-20',rows:[{customer:c.id,total:1,previous:0}],operation:op(),reviewed:true};
 assert.throws(()=>s.commit({...p,reviewed:false}),/Confira/);assert.throws(()=>s.commit(p),/outro vencimento/);
});
test('confirmação da foto é atômica: linha inválida reverte todas',t=>{
 const {s,c,sheet}=setup(t);
 assert.throws(()=>s.commit({sheet:sheet.id,hash:hash(1),purchased:'2026-08-18',operation:op(),reviewed:true,rows:[{name:'Novo cliente',total:2,previous:0},{customer:c.id,total:-1,previous:0}]}));
 assert.equal(s.snapshot().customers.length,1);assert.equal(s.snapshot().sales.length,0);assert.equal(s.snapshot().imports.length,0);
});
test('pagamento não zera contador da folha e não recria dívida paga',t=>{
 const {s,c,sheet}=setup(t);commit(s,c,sheet,3,0);s.payment({customer:c.id,cents:3000,paid:'2026-08-19',operation:op()});
 commit(s,c,sheet,4,3,2);assert.equal(s.balances().reduce((a,x)=>a+x.cents,0),1000);
});
test('backup recupera dados e importação inválida não destrói o banco',t=>{
 const {s,c,sheet}=setup(t);commit(s,c,sheet,3,0);const backup=s.backup();
 const target=use(t);target.restore(backup);assert.equal(target.snapshot().sales.length,1);
 const bad=structuredClone(backup);bad.tables.sales[0].customer='inexistente';
 assert.throws(()=>target.restore(bad));assert.equal(target.snapshot().sales.length,1);
 assert.equal(target.balances().reduce((a,x)=>a+x.cents,0),3000);
});
