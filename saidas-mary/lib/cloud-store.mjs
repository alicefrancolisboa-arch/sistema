import { Store } from './store.mjs';

// Remote snapshots are authoritative. Each operation uses an isolated SQLite
// store, then compare-and-swap commits prevent lost updates across devices.
export class CloudStore {
 constructor({url,token,fetcher=fetch}){
  const endpoint=new URL(url.replace(/^(libsql|turso):/, 'https:'));
  if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw Error('Configure um endereço HTTPS válido para o banco Turso.');
  if(!token)throw Error('Configure TURSO_AUTH_TOKEN no servidor.');
  this.endpoint=endpoint.origin+'/v2/pipeline';this.token=token;this.fetcher=fetcher;this.initializing=null;
 }
 async sql(sql,args=[]){
  try{
   const response=await this.fetcher(this.endpoint,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({requests:[{type:'execute',stmt:{sql,args:args.map(v=>typeof v==='number'?{type:'integer',value:String(v)}:{type:'text',value:v})}},{type:'close'}]})});
   if(!response.ok)throw Error('remote');
   const data=await response.json(),item=data.results?.[0];
   if(item?.type!=='ok'||!item.response?.result)throw Error('remote');
   const r=item.response.result;
   return {changed:r.affected_row_count,rows:r.rows.map(row=>Object.fromEntries(r.cols.map((col,i)=>[col.name,row[i].type==='integer'?Number(row[i].value):row[i].type==='null'?null:row[i].value])))};
  }catch{
   const e=Error('Não foi possível confirmar os dados no banco online. Confira a conexão e atualize a tela antes de tentar novamente.');e.status=503;throw e;
  }
 }
 async ready(){
  if(!this.initializing)this.initializing=this.sql('CREATE TABLE IF NOT EXISTS mary_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL, previous_payload TEXT)').catch(e=>{this.initializing=null;throw e});
  await this.initializing;
 }
 async invoke(method,args,write){
  await this.ready();
  for(let attempt=0;attempt<4;attempt++){
   const {rows}=await this.sql('SELECT revision,payload FROM mary_state WHERE id=1');
   const current=rows[0],local=new Store(':memory:');
   try{
    if(current)local.restore(JSON.parse(current.payload));
    const result=local[method](...args);
    if(!write)return result;
    const payload=JSON.stringify(local.backup());
    if(Buffer.byteLength(payload)>8*1024*1024)throw Error('O banco atingiu o limite desta versão. Exporte um backup e solicite ampliação antes de novos lançamentos.');
    const saved=current
     ?await this.sql('UPDATE mary_state SET previous_payload=CASE WHEN ?=1 THEN payload ELSE previous_payload END,payload=?,revision=revision+1 WHERE id=1 AND revision=?',[method==='restore'?1:0,payload,current.revision])
     :await this.sql('INSERT OR IGNORE INTO mary_state(id,revision,payload) VALUES(1,1,?)',[payload]);
    if(saved.changed===1)return result;
   }finally{local.close()}
  }
  const e=Error('Outra janela está atualizando a loja. Atualize a tela e tente novamente.');e.status=409;throw e;
 }
 close(){}
}
for(const method of ['snapshot','backup','sheet','imported','totals'])CloudStore.prototype[method]=function(...args){return this.invoke(method,args,false)};
for(const method of ['archiveCustomer','saveDailyStock','saveComplement','saveCustomer','sale','payment','undoPayment','createSheet','setExtras','restore','commit'])CloudStore.prototype[method]=function(...args){return this.invoke(method,args,true)};
