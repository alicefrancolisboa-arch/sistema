
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createApp} from '../server.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
let reading=0;
const {server,store}=createApp({dbPath:':memory:',apiKey:'test-only',vision:async()=>({source:'gemini',warning:'Resposta simulada apenas para testar o fluxo.',rows:[{name:'Maria Teste',total:++reading===1?3:4,uncertain:false,note:''}]})});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1100},locale:'pt-BR'});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
mkdirSync('artifacts',{recursive:true});
try{
 await page.goto(url);await page.getByRole('heading',{name:'Olá! Vamos cuidar das vendas?'}).waitFor();
 await page.screenshot({path:'artifacts/app-desktop.png',fullPage:true});
 await page.setViewportSize({width:393,height:851});
 await page.screenshot({path:'artifacts/app-android.png',fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'sem rolagem horizontal no celular');
 await page.locator('[data-nav=clientes]').click();await page.getByRole('button',{name:'＋ Novo cliente'}).click();
 await page.getByLabel('Nome e sobrenome').fill('Maria Teste');await page.getByLabel('WhatsApp com DDD').fill('19999999999');await page.getByRole('button',{name:'Salvar cliente'}).click();
 await page.locator('.customer h3').waitFor();await page.getByRole('button',{name:'＋ Venda',exact:true}).click();await page.getByLabel('Quantidade de açaís').fill('2');await page.getByRole('button',{name:'Salvar venda'}).click();
 await page.waitForFunction(()=>document.querySelector('.balance')?.textContent.includes('20,00'));
 await page.getByRole('button',{name:'Receber',exact:true}).click();await page.getByLabel('Valor recebido').fill('10,00');await page.getByRole('button',{name:'Confirmar pagamento'}).click();
 await page.waitForFunction(()=>document.querySelector('.balance')?.textContent.includes('10,00'));
 await page.locator('[data-nav=folhas]').click();await page.getByRole('button',{name:'＋ Nova folha'}).click();
 await page.getByLabel('Identificação da folha').fill('Folha teste');await page.getByRole('button',{name:'Criar folha'}).click();
 await page.locator('#gallery').setInputFiles('artifacts/folha-teste.png');await page.getByRole('button',{name:'Ler nomes e risquinhos'}).click();
 await page.locator('#review-form').waitFor();assert.equal(store.snapshot().sales.length,1);
 await page.locator('[name=customer-0]').selectOption(store.snapshot().customers[0].id);await page.locator('[name=reviewed]').check();await page.getByRole('button',{name:'Confirmar e somar apenas os novos risquinhos'}).click();
 await page.waitForFunction(()=>!document.querySelector('#review-form'));assert.equal(store.balances().reduce((a,s)=>a+s.cents,0),4000);
 await page.locator('#gallery').setInputFiles('artifacts/folha-teste.png');await page.getByRole('button',{name:'Ler nomes e risquinhos'}).click();
 await page.waitForFunction(()=>document.querySelector('#photo-error')?.textContent.includes('já foi contabilizada'));assert.equal(store.snapshot().imports.length,1);
 await page.locator('#gallery').setInputFiles('artifacts/folha-teste-2.png');await page.getByRole('button',{name:'Ler nomes e risquinhos'}).click();await page.locator('#review-form').waitFor();
 assert.equal(await page.locator('[data-previous="0"]').textContent(),'3');
 await page.locator('[name=customer-0]').selectOption(store.snapshot().customers[0].id);await page.locator('[name=reviewed]').check();await page.getByRole('button',{name:'Confirmar e somar apenas os novos risquinhos'}).click();await page.waitForFunction(()=>!document.querySelector('#review-form'));
 assert.equal(store.balances().reduce((a,s)=>a+s.cents,0),5000);
 await page.locator('[data-nav=cobrancas]').click();await page.locator('.billing-card').waitFor();assert.ok((await page.locator('a[href^="https://wa.me/"]').getAttribute('href')).includes('5519999999999'));
 await page.locator('[data-nav=historico]').click();await page.getByRole('button',{name:'Desfazer',exact:true}).click();await page.getByRole('button',{name:'Desfazer pagamento',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('dialog[open]'));assert.equal(store.balances().reduce((a,s)=>a+s.cents,0),6000);
 const b=await (await page.request.get(url+'/api/backup')).json();assert.equal(b.format,'casa-do-acai');
 for(const nav of ['inicio','clientes','folhas','cobrancas','historico','ajustes']){
  await page.locator('[data-nav='+nav+']').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'sem overflow em '+nav);
 }
 assert.deepEqual(errors,[]);
 writeFileSync('artifacts/teste-navegador.json',JSON.stringify({ok:true,flows:['cliente','venda','pagamento parcial','foto com revisão','foto repetida','nova foto só soma diferença','WhatsApp','desfazer pagamento','backup','telas em 393px'],note:'Leitor simulado neste teste de interface; teste de leitura real separado.'},null,2));
 console.log('Interface desktop e celular: todos os fluxos passaram.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
