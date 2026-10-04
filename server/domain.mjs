import {randomBytes,createHash} from 'node:crypto';
const token=()=>randomBytes(32).toString('base64url');
const id=()=>randomBytes(12).toString('hex');
export const hash=x=>createHash('sha256').update(x).digest('hex');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export const day=(time=Date.now())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(time);
// Called only after the server verifies the household PIN.
export function loginFamily(db,bearer=''){
  db.families??={};db.tokens??={};
  if(!db.webFamily){const previous=db.tokens[hash(bearer)];const families=Object.keys(db.families);db.webFamily=previous?.role==='parent'?previous.family:families.length===1?families[0]:id();}
  db.families[db.webFamily]??={children:[]};
  const value=token();db.tokens[hash(value)]={role:'parent',family:db.webFamily};return {token:value};
}
function catalog(value){if(!Array.isArray(value)||value.length>300)fail('Lista de apps inválida.');const seen=new Set();return value.map(a=>{if(!a||typeof a.package!=='string'||!/^[a-zA-Z0-9_.]{1,180}$/.test(a.package)||seen.has(a.package))fail('Aplicativo inválido.');seen.add(a.package);if(typeof a.name!=='string'||a.name.length>100)fail('Nome de aplicativo inválido.');if(a.icon&&(!/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(a.icon)||a.icon.length>2100))fail('Ícone inválido.');return {package:a.package,name:a.name,icon:a.icon||''};});}
function integer(v,min,max){return Number.isInteger(v)&&v>=min&&v<=max;}
function name(v){if(typeof v!=='string'||!v.trim()||v.length>80)fail('Use um nome de 1 a 80 caracteres.');return v.trim();}
export function validate(c){
  if(!c||!integer(c.limit,1,1440)||typeof c.enabled!=='boolean'||typeof c.rest!=='boolean'||!integer(c.start,0,1439)||!integer(c.end,0,1439)||(c.rest&&c.start===c.end))fail('Regras de tempo inválidas.');
  if(!Array.isArray(c.apps)||c.apps.length>300||c.apps.some(x=>typeof x!=='string'||!/^[a-zA-Z0-9_.]+$/.test(x)))fail('Lista de aplicativos inválida.');
  if(!Array.isArray(c.tasks)||c.tasks.length>30||c.tasks.some(t=>!t||typeof t.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(t.id)||typeof t.title!=='string'||!t.title.trim()||t.title.length>80||!integer(t.minutes,1,240))||new Set(c.tasks.map(t=>t.id)).size!==c.tasks.length)fail('Tarefas inválidas.');
  const appLabels={};for(const app of c.apps)if(typeof c.appLabels?.[app]==='string')appLabels[app]=c.appLabels[app].slice(0,100);
  return {limit:c.limit,enabled:c.enabled,blocked:c.blocked===true,rest:c.rest,start:c.start,end:c.end,apps:[...new Set(c.apps)],appLabels,tasks:c.tasks.map(t=>({id:t.id,title:t.title.trim(),minutes:t.minutes}))};
}
export function operation(db,path,body,bearer,now=Date.now()){
  db.tokens??={};db.children??={};db.families??={};db.codes??={};db.devices??={};
  for(const [k,c]of Object.entries(db.codes))if(c.expires<now)delete db.codes[k];
  let auth=db.tokens[hash(bearer||'')];const today=day(now);
  function childFor(){if(!auth)fail('Conexão não autorizada.',401);const childId=auth.role==='parent'?(body.childId||db.families[auth.family].children[0]):db.devices[auth.device]?.child;const child=db.children[childId];if(!child)fail('Selecione uma criança.',404);if(auth.role==='parent'&&!db.families[auth.family].children.includes(childId))fail('Acesso negado.',403);return child;}
  function admin(){if(!auth||!['parent','local'].includes(auth.role))fail('Somente o responsável pode fazer isso.',403);}
  function state(c){if(c.day!==today){c.history??=[];if(c.day)c.history.push({day:c.day,used:c.devices.reduce((sum,id)=>sum+(db.devices[id].day===c.day?db.devices[id].used||0:0),0),bonus:c.bonus||0,limit:c.config.limit,approved:Object.values(c.claims||{}).filter(v=>v==='approved').length});c.history=c.history.slice(-30);c.day=today;c.claims={};c.bonus=0;}const devices=c.devices.map(d=>db.devices[d]);const total=devices.reduce((a,d)=>a+(d.day===today?d.used||0:0),0);const own=auth?.device?db.devices[auth.device]:null;return {day:today,bonus:c.bonus,claims:c.claims,used:total,otherUsed:Math.max(0,total-(own?.day===today?own.used||0:0)),usageAllowed:devices.every(d=>d.usageAllowed),guardEnabled:devices.every(d=>d.guardEnabled),devices:devices.map(d=>({id:d.id,name:d.name,lastSeen:d.lastSeen||0,used:d.day===today?d.used||0:0,usageAllowed:!!d.usageAllowed,guardEnabled:!!d.guardEnabled,activity:d.activity||null}))};}
  function payload(c,includeCatalog=true){const current=state(c),apps=new Map();if(includeCatalog)for(const a of c.knownApps||[])apps.set(a.package,a);if(includeCatalog)for(const id of c.devices)for(const a of db.devices[id].catalog||[])apps.set(a.package,a);return {childId:c.id,name:c.name,config:c.config,state:current,history:c.history||[],...(includeCatalog?{catalog:[...apps.values()]}:{})};}
  if(path==='/api/register'){
    const config=validate(body.config);const child=id(),device=id(),deviceToken=token(),localToken=token(),code=randomBytes(5).toString('hex').toUpperCase();
    db.children[child]={id:child,name:name(body.name||'Criança'),devices:[device],config,day:today,bonus:0,claims:{}};
    db.devices[device]={id:device,child,name:name(body.deviceName||'Celular'),used:0};db.tokens[hash(deviceToken)]={role:'child',device};db.tokens[hash(localToken)]={role:'local',device};db.codes[hash(code)]={device,expires:now+600000};
    return {token:deviceToken,localToken,code,childId:child};
  }
  if(path==='/api/code'){admin();if(auth.role!=='local')fail('Gere o código no aparelho da criança.');const device=db.devices[auth.device];if(db.children[device.child].family)fail('Este aparelho já está vinculado.');for(const[k,c]of Object.entries(db.codes))if(c.device===device.id)delete db.codes[k];const code=randomBytes(5).toString('hex').toUpperCase();db.codes[hash(code)]={device:device.id,expires:now+600000};return {code};}
  if(path==='/api/pair'){
    if(auth&&auth.role!=='parent')fail('Use o aparelho do responsável.',403);
    const key=hash(String(body.code||'').toUpperCase()),code=db.codes[key];if(!code||code.expires<now)fail('Código inválido ou expirado. Gere outro no aparelho da criança.');
    if(code.family){if(auth)fail('Este responsável já está vinculado a uma família.');const family=db.families[code.family];if(!family||!family.children.length)fail('Família não encontrada.',404);const parentToken=token();auth={role:'parent',family:code.family};db.tokens[hash(parentToken)]=auth;delete db.codes[key];return {...payload(db.children[family.children[0]]),token:parentToken};}
    let parentToken;if(!auth){const family=id();parentToken=token();db.families[family]={children:[]};auth={role:'parent',family};db.tokens[hash(parentToken)]=auth;}
    const family=db.families[auth.family],device=db.devices[code.device],old=db.children[device.child];if(old.family)fail('Este aparelho já foi vinculado.');
    let c=old;if(body.childId){if(!family.children.includes(body.childId))fail('Criança não pertence a esta família.',403);c=db.children[body.childId];if(c.devices.length>=5)fail('Limite de cinco aparelhos por criança.');c.devices.push(device.id);device.child=c.id;delete db.children[old.id];}
    else{if(family.children.length>=20)fail('Limite de 20 crianças.');c.name=name(body.name||c.name);family.children.push(c.id);c.family=auth.family;delete c.deletedFamily;delete c.removedAt;}
    device.name=name(body.deviceName||device.name);delete db.codes[key];return {...payload(c),...(parentToken?{token:parentToken}:{})};
  }
  if(path==='/api/parent/list'){admin();if(auth.role!=='parent')fail('Use o modo responsável.');return {archived:Object.values(db.children).filter(c=>c.deletedFamily===auth.family&&!c.family).map(c=>({id:c.id,name:c.name})),children:db.families[auth.family].children.map(cid=>{const c=db.children[cid];return {id:c.id,name:c.name,...payload(c,false)};})};}
  if(path==='/api/parent/invite'){admin();if(auth.role!=='parent')fail('Convide pelo aparelho do responsável.',403);const code=randomBytes(5).toString('hex').toUpperCase();for(const[k,v]of Object.entries(db.codes))if(v.family===auth.family)delete db.codes[k];db.codes[hash(code)]={family:auth.family,expires:now+600000};return {code};}
  if(path==='/api/parent/sync'&&auth?.role==='parent'&&!db.families[auth.family].children.length)return {empty:true,childId:'',name:'Minha família',config:{},state:{day:today,bonus:0,used:0,claims:{},devices:[]},history:[]};
  if(path==='/api/parent/restore'){admin();if(auth.role!=='parent')fail('Use o painel do responsável.',403);const c=db.children[body.childId];if(!c||c.deletedFamily!==auth.family||c.family)fail('Perfil não disponível para restaurar.',403);if(db.families[auth.family].children.length>=20)fail('Limite de 20 crianças.');c.family=auth.family;delete c.deletedFamily;delete c.removedAt;db.families[auth.family].children.push(c.id);return payload(c);}
  if(path==='/api/parent/sync'&&auth?.role==='parent'&&!db.families[auth.family].children.includes(body.childId))body={...body,childId:db.families[auth.family].children[0]};
  const c=childFor();state(c);const known=new Map((c.knownApps||[]).map(a=>[a.package,a]));for(const pkg of c.config.apps)if(!known.has(pkg))known.set(pkg,{package:pkg,name:c.config.appLabels?.[pkg]||pkg,icon:""});c.knownApps=[...known.values()].slice(-300);
  if(path==='/api/parent/delete'){admin();if(auth.role!=='parent')fail('Exclua pelo painel do responsável.',403);c.deletedFamily=auth.family;c.removedAt=now;delete c.family;db.families[auth.family].children=db.families[auth.family].children.filter(id=>id!==c.id);c.config={...c.config,enabled:false,blocked:false,apps:[]};delete c.config.release;return {removed:true};}
  if(path==='/api/parent/sync'){admin();return payload(c);}
  if(path==='/api/child/sync'){
    if(auth.role!=='child')fail('Use o aparelho da criança.',403);const d=db.devices[auth.device];if(!integer(body.used,0,172800000))fail('Tempo inválido.');if(body.day!==today)fail('Ajuste a data e o fuso do aparelho para São Paulo.');if(body.catalog!==undefined)d.catalog=catalog(body.catalog);if(body.activity!==undefined){const a=body.activity;if(a===null)d.activity={app:null,receivedAt:now};else{const checked=catalog([a])[0];d.activity={app:checked,blocked:a.blocked===true,receivedAt:now};}}d.day=today;d.used=body.used;d.lastSeen=now;d.usageAllowed=body.usageAllowed===true;d.guardEnabled=body.guardEnabled===true;return payload(c);
  }
  if(path==='/api/parent/config'){admin();const release=c.config.release;c.config=validate(body.config);if(release)c.config.release=release;return payload(c);}
  if(path==='/api/parent/block'){admin();if(typeof body.blocked!=='boolean')fail('Informe bloquear ou liberar.');c.config={...c.config,blocked:body.blocked};if(body.blocked)delete c.config.release;return payload(c);}
  if(path==='/api/parent/release'){admin();if(body.mode==='none'){delete c.config.release;return payload(c);}if(!['all','apps'].includes(body.mode)||!integer(body.minutes,0,1440))fail('Escolha a liberação e um prazo de 0 a 1440 minutos.');let apps=[];if(body.mode==='apps'){if(!Array.isArray(body.apps)||!body.apps.length||body.apps.some(a=>!c.config.apps.includes(a)))fail('Escolha pelo menos um aplicativo controlado.');apps=[...new Set(body.apps)];}c.config.release={all:body.mode==='all',apps,until:body.minutes===0?0:now+body.minutes*60000};return payload(c);}
  if(path==='/api/parent/app-policy'){admin();if(!['block','limit','allow','free'].includes(body.action))fail('Escolha bloquear, liberar ou aplicar limite.');const checked=validate({...c.config,apps:body.apps,appLabels:body.appLabels||c.config.appLabels});if(body.action==='free'){const release=c.config.release;c.config=validate({...c.config,apps:c.config.apps.filter(p=>!checked.apps.includes(p))});if(release)c.config.release=release;}else if(body.action==='allow'){const minutes=body.minutes??0;if(!integer(minutes,0,1440))fail('Informe de 0 a 1440 minutos.');const allowed=checked.apps.filter(p=>c.config.apps.includes(p));if(allowed.length)c.config.release={all:false,apps:allowed,until:minutes===0?0:now+minutes*60000};}else{c.config={...checked,enabled:true,blocked:body.action==='block'};delete c.config.release;}return payload(c);}
  if(path==='/api/parent/apps'){admin();const release=c.config.release;c.config=validate({...c.config,apps:body.apps,appLabels:body.appLabels||c.config.appLabels});if(release)c.config.release=release;return payload(c);}
  if(path==='/api/parent/rename'){admin();c.name=name(body.name);return payload(c);}
  if(path==='/api/child/claim'){
    if(auth.role!=='child')fail('Use o aparelho da criança.',403);const t=c.config.tasks.find(t=>t.id===body.taskId);if(!t)fail('Tarefa não encontrada.',404);if(c.claims[t.id]!=='approved')c.claims[t.id]='pending';return payload(c);
  }
  if(path==='/api/parent/approve'||path==='/api/parent/reject'){
    admin();const task=c.config.tasks.find(t=>t.id===body.taskId);if(!task)fail('Tarefa não encontrada.',404);if(c.claims[task.id]==='approved')return payload(c);if(c.claims[task.id]!=='pending')fail('A criança precisa concluir esta tarefa primeiro.');
    if(path.endsWith('/approve')){c.bonus+=task.minutes;c.claims[task.id]='approved';}else c.claims[task.id]='rejected';return payload(c);
  }
  fail('Rota não encontrada.',404);
}

