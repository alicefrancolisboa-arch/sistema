import fs from 'node:fs/promises';
// Arrays stay atomic; object changes omit unchanged catalogs, icons and history.
function differences(before, after, path='$', changes=[]) {
  if(JSON.stringify(before)===JSON.stringify(after))return changes;
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  if(object(before)&&object(after)) {
    for(const key of new Set([...Object.keys(before),...Object.keys(after)])) {
      // SQLite JSON paths cannot address every possible quoted property name.
      if(/["\\]/.test(key))throw Error('Use full snapshot');
      const child=path+'.'+JSON.stringify(key);
      if(!Object.hasOwn(after,key))changes.push({path:child,remove:true});
      else if(!Object.hasOwn(before,key))changes.push({path:child,value:JSON.stringify(after[key])});
      else differences(before[key],after[key],child,changes);
    }
  } else changes.push({path,value:JSON.stringify(after)});
  return changes;
}

// Apply all changes and the revision check in one atomic statement. JSON nulls
// are values, not deletions (unlike JSON Merge Patch).
const patchSql=`WITH RECURSIVE
  changes AS (SELECT CAST(key AS INTEGER) AS n,value FROM json_each(?)),
  patched(n,payload) AS (
    SELECT -1,payload FROM tempo_family_store WHERE id=1 AND revision=?
    UNION ALL
    SELECT changes.n,CASE WHEN json_extract(changes.value,'$.remove')=1
      THEN json_remove(patched.payload,json_extract(changes.value,'$.path'))
      ELSE json_set(patched.payload,json_extract(changes.value,'$.path'),json(json_extract(changes.value,'$.value'))) END
    FROM patched JOIN changes ON changes.n=patched.n+1
  )
  UPDATE tempo_family_store SET payload=(SELECT payload FROM patched ORDER BY n DESC LIMIT 1),
    revision=revision+1 WHERE id=1 AND revision=?`;

export async function storage({env=process.env,fetch:request=globalThis.fetch}={}) {
  if(env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN) {
    const url=env.TURSO_DATABASE_URL.replace('libsql://','https://')+'/v2/pipeline';
    async function sql(query,args=[]) {
      const r=await request(url,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${env.TURSO_AUTH_TOKEN}`},body:JSON.stringify({requests:[{type:'execute',stmt:{sql:query,args:args.map(v=>({type:'text',value:String(v)}))}},{type:'close'}]})});
      if(!r.ok)throw Error('Armazenamento indisponível');const result=(await r.json()).results[0];if(result.type==='error')throw Error('Falha de persistência');return result.response.result;
    }
    await sql('CREATE TABLE IF NOT EXISTS tempo_family_store (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL)');
    await sql("INSERT OR IGNORE INTO tempo_family_store VALUES (1,0,'{}')");
    let cached=null;
    return {
      persistent:true,
      async load(){
        try {
          // Always ask Turso for the current revision, including on cache hits.
          const r=await sql('SELECT revision,CASE WHEN revision=? THEN NULL ELSE payload END FROM tempo_family_store WHERE id=1',[cached?.revision??-1]);
          if(!r.rows?.length)throw Error('Armazenamento indisponível');
          const revision=Number(r.rows[0][0].value);
          const serialized=r.rows[0][1].type==='null'?cached?.serialized:r.rows[0][1].value;
          if(typeof serialized!=='string')throw Error('Armazenamento indisponível');
          const data=JSON.parse(serialized);
          cached={revision,serialized};
          // Operations mutate data; never hand out the cached baseline itself.
          return {revision,data};
        } catch(error){cached=null;throw error;}
      },
      async save(data,revision){
        if(!cached||cached.revision!==revision)throw Error('Conflito de atualização; tente novamente');
        const serialized=JSON.stringify(data);
        if(serialized===cached.serialized)return;
        let changes;
        try {changes=differences(JSON.parse(cached.serialized),JSON.parse(serialized));}catch {changes=null;}
        const patch=changes&&JSON.stringify(changes);
        // Keep unusual or bulk changes safe with the original snapshot path.
        const usePatch=changes?.length<=128&&patch.length<serialized.length;
        try {
          const r=usePatch
            ?await sql(patchSql,[patch,revision,revision])
            :await sql('UPDATE tempo_family_store SET payload=?,revision=revision+1 WHERE id=1 AND revision=?',[serialized,revision]);
          if(r.affected_row_count!==1)throw Error('Conflito de atualização; tente novamente');
          cached={revision:revision+1,serialized};
        } catch(error){cached=null;throw error;}
      }
    };
  }
  if(env.RENDER || env.NODE_ENV==='production')throw Error('Produção exige TURSO_DATABASE_URL e TURSO_AUTH_TOKEN para persistência.');
  const path=env.DATA_FILE||'family-data.json';
  return {persistent:false,async load(){try{return JSON.parse(await fs.readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return {revision:0,data:{}};}},async save(data,revision){await fs.writeFile(path+'.tmp',JSON.stringify({revision:revision+1,data}),{mode:0o600});await fs.rename(path+'.tmp',path);}};
}
