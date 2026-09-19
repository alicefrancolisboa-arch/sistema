import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
test('servidor: saúde pública, dados protegidos e cookie HTTPS',async t=>{
 const previous=process.env.COOKIE_SECURE;process.env.COOKIE_SECURE='true';
 const {server}=createApp({dbPath:':memory:',password:'senha-teste-servidor'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));if(previous===undefined)delete process.env.COOKIE_SECURE;else process.env.COOKIE_SECURE=previous;});
 const url='http://127.0.0.1:'+server.address().port;
 const health=await fetch(url+'/healthz');assert.equal(health.status,200);assert.deepEqual(await health.json(),{ok:true,app:'saidas-mary'});
 assert.equal((await fetch(url+'/api/state')).status,401);
 const login=await fetch(url+'/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-Acai-App':'1'},body:JSON.stringify({password:'senha-teste-servidor'})});assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/; Secure/);
});
test('servidor: DATA_DIR preserva os dados após reabrir',()=>{
 const dir=mkdtempSync(join(tmpdir(),'mary-cloud-')),before=process.env.DATA_DIR;process.env.DATA_DIR=dir;
 try{let app=createApp();app.store.saveCustomer({name:'Teste persistência',phone:''});app.store.close();app=createApp();assert.equal(app.store.snapshot().customers[0].name,'Teste persistência');app.store.close();}
 finally{if(before===undefined)delete process.env.DATA_DIR;else process.env.DATA_DIR=before;rmSync(dir,{recursive:true,force:true});}
});
