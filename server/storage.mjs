import fs from 'node:fs/promises';
export async function storage() {
  if(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    const url=process.env.TURSO_DATABASE_URL.replace('libsql://','https://')+'/v2/pipeline';
    async function sql(query,args=[]) {
      const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${process.env.TURSO_AUTH_TOKEN}`},body:JSON.stringify({requests:[{type:'execute',stmt:{sql:query,args:args.map(v=>({type:'text',value:String(v)}))}},{type:'close'}]})});
      if(!r.ok)throw Error('Armazenamento indisponível');const result=(await r.json()).results[0];if(result.type==='error')throw Error('Falha de persistência');return result.response.result;
    }
    await sql('CREATE TABLE IF NOT EXISTS tempo_family_store (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL)');
    await sql("INSERT OR IGNORE INTO tempo_family_store VALUES (1,0,'{}')");
    return {persistent:true,async load(){const r=await sql('SELECT revision,payload FROM tempo_family_store WHERE id=1');return {revision:Number(r.rows[0][0].value),data:JSON.parse(r.rows[0][1].value)};},async save(data,revision){const r=await sql('UPDATE tempo_family_store SET payload=?,revision=revision+1 WHERE id=1 AND revision=?',[JSON.stringify(data),revision]);if(r.affected_row_count!==1)throw Error('Conflito de atualização; tente novamente');}};
  }
  if(process.env.RENDER || process.env.NODE_ENV==='production')throw Error('Produção exige TURSO_DATABASE_URL e TURSO_AUTH_TOKEN para persistência.');
  const path=process.env.DATA_FILE||'family-data.json';
  return {persistent:false,async load(){try{return JSON.parse(await fs.readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return {revision:0,data:{}};}},async save(data,revision){await fs.writeFile(path+'.tmp',JSON.stringify({revision:revision+1,data}),{mode:0o600});await fs.rename(path+'.tmp',path);}};
}
