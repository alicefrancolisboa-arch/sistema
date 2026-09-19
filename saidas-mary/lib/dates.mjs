
export const PRICE = 1000;
export const iso = d => d.toISOString().slice(0,10);
export function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('Informe uma data válida.');
  const d = new Date(value + 'T12:00:00Z');
  if (!Number.isFinite(d.getTime()) || iso(d)!==value || d.getUTCFullYear()<2020 || d.getUTCFullYear()>2100) throw Error('Data inválida (2020 a 2100).');
  return d;
}
export function today() {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  return ['year','month','day'].map(t=>parts.find(p=>p.type===t).value).join('-');
}
export function addDays(value,n) { const d=date(value); d.setUTCDate(d.getUTCDate()+n); return iso(d); }
export function easter(year) {
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;
  return iso(new Date(Date.UTC(year,month-1,day,12)));
}
// Base: calendário municipal de Piracicaba de 2026. Pontos facultativos não são feriados.
// Datas recorrentes projetadas para outros anos; ajustes extraordinários são configuráveis.
export function holidays(year, extra=[]) {
  const fixed=['01-01','04-21','05-01','06-13','07-09','09-07','10-12','11-02','11-15','11-20','12-08','12-25'];
  return new Set([...fixed.map(x=>year+'-'+x),addDays(easter(year),-2),addDays(easter(year),60),...extra]);
}
export function fifthBusinessDay(year,month,extra=[]) {
  const excluded=holidays(year,extra); let count=0;
  for(let n=1;n<=31;n++) {
    const d=new Date(Date.UTC(year,month-1,n,12)),s=iso(d);
    if(d.getUTCDay()!==0 && d.getUTCDay()!==6 && !excluded.has(s) && ++count===5) return s;
  }
  throw Error('Não foi possível calcular o quinto dia útil.');
}
export function dueDate(purchased,extra=[]) {
  const d=date(purchased),y=d.getUTCFullYear(),m=d.getUTCMonth()+1;
  if(d.getUTCDate()<20) return iso(new Date(Date.UTC(y,m-1,20,12)));
  const next=new Date(Date.UTC(y,m,1,12));
  return fifthBusinessDay(next.getUTCFullYear(),next.getUTCMonth()+1,extra);
}
export function reminders(value,extra=[]) {
  const d=date(value),y=d.getUTCFullYear(),m=d.getUTCMonth()+1;
  const fifth=fifthBusinessDay(y,m,extra), list=[];
  if(value===addDays(fifth,-1)) list.push({due:fifth,label:'Cobrança do 5º dia útil'});
  if([18,19].includes(d.getUTCDate())) list.push({due:iso(new Date(Date.UTC(y,m-1,20,12))),label:d.getUTCDate()===18?'Prévia do dia 20':'Fechamento do dia 20'});
  return list;
}
export const money = cents => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
export const prettyDate = s => date(s).toLocaleDateString('pt-BR',{timeZone:'UTC'});
export function message(name,cents,due) { return 'Olá, '+name+'! Seu saldo de açaí para pagamento até '+prettyDate(due)+' é de '+money(cents)+'. Obrigado! — Saídas Mary'; }
