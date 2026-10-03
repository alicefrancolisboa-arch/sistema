import fs from 'node:fs';
import {randomBytes,pbkdf2Sync} from 'node:crypto';
import {operation,day} from '../server/domain.mjs';
import vm from 'node:vm';
const html=fs.readFileSync('server/mobile.html','utf8');new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
const salt=randomBytes(24);process.env.FAMILY_PIN_VERIFIER=JSON.stringify({salt:salt.toString('base64'),hash:pbkdf2Sync('543210',salt,60000,32,'sha256').toString('base64')});process.env.DATA_FILE='outputs/preview-family.json';process.env.PORT='8788';
const db={},config={limit:120,enabled:true,rest:true,start:1260,end:420,apps:['app.game','app.video'],appLabels:{'app.game':'Jogos','app.video':'Vídeos'},tasks:[{id:'read',title:'Ler por 20 minutos',minutes:15},{id:'room',title:'Arrumar o quarto',minutes:20}]};
let parent;
for(let i=1;i<=5;i++){const c=operation(db,'/api/register',{name:'Criança '+i,deviceName:i===2?'Tablet':'Celular',config},'');const p=operation(db,'/api/pair',{code:c.code},parent||'');parent=parent||p.token;operation(db,'/api/child/sync',{used:i*600000,day:day(),usageAllowed:true,guardEnabled:true,catalog:[{package:'app.game',name:'Jogos (teste)',icon:''},{package:'app.video',name:'Vídeos (teste)',icon:''}],activity:{package:'app.game',name:'Jogos (teste)',icon:''}},c.token);if(i===1)operation(db,'/api/child/claim',{taskId:'read'},c.token);}
const invite=operation(db,'/api/parent/invite',{},parent);fs.writeFileSync(process.env.DATA_FILE,JSON.stringify({data:db,revision:1}));console.log('Código de teste local: '+invite.code+'; PIN de teste: 543210');await import('../server/server.mjs');
