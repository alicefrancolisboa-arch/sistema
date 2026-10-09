import {randomUUID} from 'node:crypto';
import {hash} from './domain.mjs';

export function parentFamily(data,bearer){
  const auth=data.tokens?.[hash(bearer||'')];
  if(auth?.role!=='parent'||!data.families?.[auth.family])
    throw Object.assign(Error('Entre como responsável.'),{status:401});
  return auth.family;
}
export function affectedFamily(data,bearer){
  const auth=data.tokens?.[hash(bearer||'')];
  return auth?.role==='parent'?auth.family:data.children?.[data.devices?.[auth?.device]?.child]?.family;
}
// Only opaque counters travel over the wire. Each family has its own waiters.
export class FamilyLive {
  constructor(timeout=25000){this.epoch=randomUUID();this.families=new Map();this.timeout=timeout;}
  entry(family){if(!this.families.has(family))this.families.set(family,{version:0,waiters:new Set()});return this.families.get(family);}
  cursor(family){return this.epoch+':'+this.entry(family).version;}
  changed(family){if(!family)return;const e=this.entry(family);e.version++;for(const finish of [...e.waiters])finish(true);}
  wait(family,cursor,signal){
    if(cursor!==this.cursor(family))return Promise.resolve({cursor:this.cursor(family),changed:true});
    if(signal?.aborted)return Promise.resolve({cursor,changed:false});
    const e=this.entry(family);
    return new Promise(resolve=>{
      const finish=changed=>{clearTimeout(timer);e.waiters.delete(finish);signal?.removeEventListener('abort',cancel);resolve({cursor:this.cursor(family),changed});};
      const cancel=()=>finish(false),timer=setTimeout(()=>finish(false),this.timeout);
      e.waiters.add(finish);signal?.addEventListener('abort',cancel,{once:true});
    });
  }
}
