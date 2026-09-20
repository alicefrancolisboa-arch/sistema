
import {dueDate, fifthBusinessDay, addDays, money, prettyDate, reminders, today} from '/dates.mjs';
const $=s=>document.querySelector(s);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id=()=>crypto.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
let state,view='inicio',search='',selectedDue='',photo=null,review=null,selectedSheet='',photoDate=today(),installPrompt,toastTimer;
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,6500);}
async function api(path,body){
 const res=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json','X-Acai-App':'1'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await res.json();if(res.status===401){login();throw Error(data.error);}if(!res.ok)throw Error(data.error||'Não foi possível concluir.');return data;
}
async function refresh(){state=await api('state');$('#top-date').textContent=new Date(state.today+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});render();}
const activeCustomers=()=>state.customers.filter(c=>!state.archivedCustomers?.some(a=>a.customer===c.id));
let stockDay=today();
function customer(cid){return state.customers.find(c=>c.id===cid);}
function balance(cid,cutoff='9999-12-31'){return state.balances.filter(s=>(!cid||s.customer===cid)&&s.due<=cutoff).reduce((a,s)=>a+s.cents,0);}
const pendingCustomers=cutoff=>state.customers.map(c=>({...c,balance:balance(c.id,cutoff)})).filter(c=>c.balance>0);
const initials=name=>name.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase();
const empty=(title,desc,button='')=>'<div class="empty"><span class="empty-icon">▧</span><strong>'+esc(title)+'</strong><p>'+esc(desc)+'</p>'+button+'</div>';
function head(kicker,title,desc,action=''){return '<div class="page-head"><div><div class="eyebrow">'+kicker+'</div><h1>'+title+'</h1><p class="subtitle">'+desc+'</p></div>'+action+'</div>';}
function btn(text,action,extra='',classes=''){return '<button type="button" class="button '+classes+'" data-action="'+action+'" '+extra+'>'+text+'</button>';}
function dates(){
 const now=new Date(state.today+'T12:00:00Z'),result=new Set(state.sales.map(s=>s.due));
 for(let offset=-1;offset<4;offset++){const d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+offset,1));result.add(fifthBusinessDay(d.getUTCFullYear(),d.getUTCMonth()+1,state.extraHolidays));result.add(d.toISOString().slice(0,8)+'20');}
 return [...result].sort();
}
function defaultDue(){return dates().find(d=>d>=state.today)||dueDate(state.today,state.extraHolidays);}
function dueLabel(d){return prettyDate(d)+(d.endsWith('-20')?' · Dia 20':' · 5º dia útil');}
function render(){
 if(!state)return;view=location.hash.slice(1)||'inicio';if(!['inicio','clientes','folhas','cobrancas','historico','estoque','ajustes'].includes(view))view='inicio';
 document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===view));
 $('#main').innerHTML=({inicio:home,clientes:clients,folhas:sheets,cobrancas:billing,historico:history,estoque:stockPage,ajustes:settings})[view]();bindForms();
}
function home(){
 const total=balance(),received=state.payments.filter(p=>p.paid.startsWith(state.today.slice(0,7))).reduce((a,p)=>a+p.cents,0),alerts=reminders(state.today,state.extraHolidays);
 return head('VISÃO GERAL','Olá! Vamos cuidar das vendas?','Tudo o que você precisa para manter o seu açaí em dia.',btn('＋ Nova venda','sale'))+
 '<section class="quick-actions" aria-label="Registrar vendas"><a class="quick-action" href="#folhas"><strong>▤ Enviar foto da folha</strong><span>Escolha uma imagem ou tire uma foto dos risquinhos.</span></a><button class="quick-action" type="button" data-action="sale"><strong>＋ Venda manual</strong><span>Informe o cliente e a quantidade, sem precisar de foto.</span></button></section>'+
 alerts.map(a=>'<div class="notice"><strong>'+esc(a.label)+' hoje.</strong> '+pendingCustomers(a.due).length+' clientes com saldo até '+prettyDate(a.due)+'. <a href="#cobrancas" data-due="'+a.due+'">Ver lista de cobrança →</a></div>').join('')+
 '<section class="hero"><div><div class="eyebrow">DA SUA FOLHA PARA O SEU CONTROLE</div><h2>Cada risquinho conta.</h2><p>Fotografe a folha, confira os nomes e as quantidades.<br>O aplicativo faz as contas para você.</p><a class="button" href="#folhas">▤ Ler uma folha ↗</a></div><div class="sheet-art" aria-hidden="true"><b>Meu açaí</b><div>Nome <i>||||</i></div><div>Nome <i>||</i></div><div>Nome <i>|||</i></div></div></section>'+
 '<section class="stats"><div class="stat"><label>Total a receber <span>↗</span></label><strong>'+money(total)+'</strong><small>'+pendingCustomers().length+' clientes com saldo pendente</small></div><div class="stat accent"><label>Recebido neste mês <span>✓</span></label><strong>'+money(received)+'</strong><small>Pagamentos que você registrou</small></div><div class="stat"><label>Açaís vendidos <span>▥</span></label><strong>'+state.sales.reduce((a,s)=>a+s.qty,0)+'</strong><small>Cada unidade vale R$ 10,00</small></div><div class="stat"><label>Clientes cadastrados <span>♙</span></label><strong>'+state.customers.length+'</strong><small>Contas organizadas por pessoa</small></div></section>'+
 '<div class="grid"><section class="panel"><div class="panel-head"><h2>Próximas cobranças</h2><a class="link tiny" href="#cobrancas">Ver lista →</a></div>'+
 dates().filter(d=>d>=state.today).slice(0,3).map(d=>'<div class="schedule"><div class="calendar"><small>'+new Date(d+'T12:00:00Z').toLocaleDateString('pt-BR',{month:'short',timeZone:'UTC'}).replace('.','')+'</small>'+d.slice(-2)+'</div><div><strong>'+(d.endsWith('-20')?'Pagamento do dia 20':'Quinto dia útil')+'</strong><p>'+(d.endsWith('-20')?'Prévia dia 18 · Fechamento dia 19':'Preparar mensagens em '+prettyDate(addDays(d,-1)))+'</p></div><span class="right">'+money(state.balances.filter(s=>s.due===d).reduce((a,s)=>a+s.cents,0))+'</span></div>').join('')+
 '<p class="tiny muted">As listas ficam disponíveis no aplicativo. As mensagens são enviadas por você.</p></section>'+
 '<section class="panel"><div class="panel-head"><h2>Últimas vendas</h2><span class="tag">R$ 10 / unidade</span></div>'+
 (state.sales.length?'<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Qtd.</th><th>Valor</th></tr></thead><tbody>'+state.sales.slice(0,5).map(s=>'<tr><td>'+esc(customer(s.customer)?.name)+'</td><td>'+s.qty+'</td><td class="amount">'+money(s.qty*1000)+'</td></tr>').join('')+'</tbody></table></div>':empty('Sua primeira venda começa aqui','Cadastre um cliente e registre os açaís vendidos.',btn('Registrar venda','sale','','secondary small')))+'</section></div>';
}
function clients(){
 const found=activeCustomers().filter(c=>c.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
 return head('SEUS CLIENTES','Uma conta para cada pessoa.','Vendas, pagamentos e saldo sempre juntos.',btn('＋ Novo cliente','customer'))+
 '<div class="toolbar"><input id="search" type="search" placeholder="Buscar pelo nome do cliente…" aria-label="Buscar cliente" value="'+esc(search)+'"></div><div class="cards">'+
 (found.length?found.map(c=>'<article class="customer"><div class="row"><div class="avatar">'+esc(initials(c.name))+'</div><div class="grow"><h3>'+esc(c.name)+'</h3><span class="tiny muted">'+esc(c.phone?c.phone.replace(/^55/,''):'WhatsApp não cadastrado')+'</span></div>'+btn('Editar','customer','data-id="'+c.id+'"','ghost small')+btn('Excluir','archive-customer','data-id="'+c.id+'"','ghost small')+'</div><div class="balance">'+money(balance(c.id))+'</div><p class="tiny muted">Saldo pendente · '+state.sales.filter(s=>s.customer===c.id).reduce((a,s)=>a+s.qty,0)+' açaís no histórico</p>'+customerPurchases(c.id)+'<div class="row">'+btn('＋ Venda','sale','data-id="'+c.id+'"','secondary small')+btn('Receber','payment','data-id="'+c.id+'" '+(balance(c.id)?'':'disabled'),'small')+'</div></article>').join(''):empty(search?'Nenhum cliente encontrado':'Seu caderno de clientes','Cadastre nome e, se quiser, o WhatsApp.'))+'</div>'+archivedList();
}
function sheets(){
 const options=state.sheets.map(s=>'<option value="'+s.id+'" '+(s.id===selectedSheet?'selected':'')+'>'+esc(s.name)+' · '+prettyDate(s.due)+'</option>').join('');
 return head('LEITURA DE FOLHAS','A foto entra. A conta fica pronta.','Conte os risquinhos com ajuda da IA e confira antes de salvar.')+
 (!state.geminiConfigured?'<div class="notice warn"><strong>OCR de reserva disponível.</strong> Configure o Gemini em <a href="#ajustes">Ajustes</a> para a leitura principal dos nomes e risquinhos.</div>':'')+
 '<section class="panel"><div class="panel-head"><h2>1. Escolha a folha</h2>'+btn('＋ Nova folha','sheet','','secondary small')+'</div><div class="form-grid"><label class="field">Folha de anotações<select id="sheet-select"><option value="">Selecione uma folha…</option>'+options+'</select></label><label class="field">Data das compras acrescentadas<input id="photo-date" type="date" max="'+state.today+'" value="'+photoDate+'"><small>Se houver compras de dias diferentes, use a data mais recente do mesmo período.</small></label></div><p class="tiny muted">Use a mesma folha ao fotografar novos risquinhos. Uma nova folha deve começar do zero e conter compras de um único vencimento. Ao mudar de período, comece outra folha.</p></section>'+
 '<section class="panel"><h2>2. Fotografe ou escolha uma imagem</h2><div class="upload"><div class="symbol">▤</div><h3>Nomes e risquinhos bem visíveis</h3><p>Use boa luz e fotografe a folha inteira, sem cortar os nomes.</p><div class="row"><label class="button file-button">Tirar foto<input id="camera" type="file" accept="image/*" capture="environment" aria-label="Tirar foto da folha"></label><label class="button secondary file-button">Escolher foto<input id="gallery" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Escolher foto da galeria"></label></div></div>'+
 (photo?'<img class="preview" src="'+photo+'" alt="Foto da folha selecionada">'+btn('Ler nomes e risquinhos','read-photo',state.visionReady?'':'disabled','full')+'<p class="tiny muted">Ao ler, a foto será enviada ao Gemini, se configurado. Se ele falhar, o OCR fará a leitura no próprio servidor. A foto não fica armazenada no aplicativo.</p>':'')+'<p id="photo-error" class="error-text" role="alert"></p></section>'+(review?reviewHtml():'');
}
function reviewHtml(){
 return '<section class="panel" id="review"><div class="panel-head"><h2>3. Confira antes de contabilizar</h2><span class="tag warn">Revisão obrigatória</span></div>'+
 '<p class="tiny muted">Leitor utilizado: <strong>'+(review.source==='ocr'?'OCR local em português':'Gemini')+'</strong></p>'+(review.warning?'<div class="notice warn">'+esc(review.warning)+'</div>':'')+(review.rawText?'<details><summary>Ver texto recuperado pelo OCR</summary><pre class="ocr-text">'+esc(review.rawText)+'</pre></details>':'')+
 '<p class="tiny muted">Cada lado vale 1 açaí: quadrado fechado = 4 (R$ 40); quadrado com risco atravessando = 5 (R$ 50). “Total na foto” inclui os risquinhos antigos. Somente a diferença será adicionada. A IA pode errar nomes e contagens; confira cada linha com a foto.</p>'+
 '<form id="review-form">'+review.rows.map((r,i)=>'<div class="review-row '+(r.uncertain?'attention':'')+'" data-row="'+i+'">'+btn('Remover linha','remove-row','data-index="'+i+'"','ghost small exclude')+
 '<label class="field">Nome lido<input name="name-'+i+'" value="'+esc(r.name)+'" maxlength="80" required></label>'+
 (r.matchedCustomer?'<div class="notice">Já existe um cliente chamado <strong>'+esc(customer(r.matchedCustomer)?.name)+'</strong>. É a mesma pessoa?</div>':'')+'<label class="field">Quem comprou?<select required name="customer-'+i+'" data-match="'+i+'"><option value="">Escolha se é o mesmo cliente…</option><option value="__new__" '+(r.createNew||(!r.matchedCustomer&&!r.customer)?'selected':'')+'>Não, criar outro cliente com este nome</option>'+activeCustomers().map(c=>'<option value="'+c.id+'" '+(c.id===r.customer?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></label>'+
 '<label class="field">Data da compra deste cliente<input type="date" name="purchased-'+i+'" max="'+state.today+'" value="'+(r.purchased||photoDate)+'" required></label>'+'<label class="field">Total de risquinhos na foto<input name="total-'+i+'" data-total="'+i+'" type="number" min="0" max="10000" step="1" inputmode="numeric" required value="'+(r.total??'')+'"></label>'+
 (r.uncertain?'<span class="tag warn">Confira esta leitura com atenção</span>':'')+(r.note?'<p class="tiny muted">'+esc(r.note)+'</p>':'')+
 '<div class="counts"><span>Já contabilizados: <b data-previous="'+i+'">'+r.previous+'</b></span><strong data-delta="'+i+'">Novos: '+(r.total===null?'?':r.total-r.previous)+'</strong></div></div>').join('')+
 btn('＋ Adicionar linha que faltou','add-row','','secondary small')+
 '<label class="check"><input type="checkbox" name="reviewed" required><span>Conferi os nomes, os risquinhos e o período. Esta foto é uma atualização da folha selecionada e não mistura cobranças de outro vencimento.</span></label><p class="error-text" role="alert"></p><button type="submit" class="button green full">Confirmar e somar apenas os novos risquinhos</button></form></section>';
}
function billing(){
 if(!selectedDue)selectedDue=defaultDue();
 const list=pendingCustomers(selectedDue),overdue=state.balances.filter(s=>s.due<state.today&&s.due<=selectedDue).reduce((a,s)=>a+s.cents,0);
 return head('COBRANÇAS','Tudo pronto para lembrar seus clientes.','Confira os valores e envie as mensagens pelo WhatsApp.')+
 '<div class="toolbar"><select id="due-select" aria-label="Data limite da cobrança">'+dates().map(d=>'<option value="'+d+'" '+(d===selectedDue?'selected':'')+'>'+dueLabel(d)+'</option>').join('')+'</select>'+btn('Copiar lista','copy-list','','secondary')+btn('Imprimir','print','','secondary')+'</div>'+
 '<div class="notice"><strong>'+list.length+' clientes · '+money(list.reduce((a,c)=>a+c.balance,0))+'</strong> a receber até '+prettyDate(selectedDue)+'.'+(overdue?' Inclui '+money(overdue)+' de vencimentos anteriores.':'')+'<br>Compras com vencimento posterior não entram nesta lista.</div>'+
 (selectedDue.endsWith('-20')?'<p class="tiny muted">Dia 18: prévia. Dia 19: confira as últimas compras antes de enviar. Novas vendas atualizam a lista automaticamente.</p>':'<p class="tiny muted">Prepare as mensagens em '+prettyDate(addDays(selectedDue,-1))+', um dia antes do quinto dia útil.</p>')+
 (list.length?list.map(c=>'<article class="billing-card"><div class="row spread"><h3>'+esc(c.name)+'</h3><span class="total">'+money(c.balance)+'</span></div><div class="message">'+esc(billMessage(c))+'</div><div class="row">'+btn('Copiar mensagem','copy-message','data-id="'+c.id+'"','secondary small')+(c.phone?'<a class="button green small" target="_blank" rel="noopener noreferrer" href="https://wa.me/'+c.phone+'?text='+encodeURIComponent(billMessage(c))+'">Abrir WhatsApp ↗</a>':btn('Cadastrar WhatsApp','customer','data-id="'+c.id+'"','secondary small'))+btn('Registrar pagamento','payment','data-id="'+c.id+'"','ghost small')+'</div></article>').join(''):empty('Tudo em dia neste vencimento','Nenhum cliente tem saldo pendente até a data selecionada.'));
}
function billMessage(c){
 const late=state.balances.filter(s=>s.customer===c.id&&s.due<selectedDue).reduce((a,s)=>a+s.cents,0);
 return 'Olá, '+c.name+'! Seu saldo de açaí para pagamento até '+prettyDate(selectedDue)+' é de '+money(c.balance)+'.'+(late?' Esse valor inclui '+money(late)+' de cobranças anteriores.':'')+' Obrigado! — Açaí da Mary';
}
function history(){
 const entries=[...state.sales.map(s=>({...s,kind:'Venda',value:s.qty*1000,when:s.purchased})),...state.payments.map(p=>({...p,kind:'Pagamento',value:p.cents,when:p.paid}))].sort((a,b)=>b.created.localeCompare(a.created));
 return head('HISTÓRICO','Cada entrada, registrada.','Confira as vendas e os pagamentos da sua loja.')+
 '<section class="panel">'+(entries.length?'<div class="table-wrap"><table><thead><tr><th>Data</th><th>Cliente</th><th>Registro</th><th>Vencimento</th><th>Valor</th><th>Ação</th></tr></thead><tbody>'+entries.map(e=>'<tr><td>'+prettyDate(e.when)+'</td><td>'+esc(customer(e.customer)?.name)+'</td><td><span class="tag '+(e.kind==='Pagamento'?'':'purple')+'">'+e.kind+'</span><br><small class="muted">'+(e.kind==='Venda'?e.qty+' açaí(s) · '+(e.source==='manual'?'manual':'foto'):'Recebido')+'</small></td><td>'+(e.due?prettyDate(e.due):'—')+'</td><td class="amount">'+money(e.value)+'</td><td>'+(e.kind==='Pagamento'?btn('Desfazer','undo-payment','data-id="'+e.id+'"','ghost small'):'—')+'</td></tr>').join('')+'</tbody></table></div>':empty('Nenhum registro ainda','As vendas e os pagamentos aparecerão aqui.'))+'</section>'+
 '<section class="panel"><h2>Fotos contabilizadas</h2>'+(state.imports.length?state.imports.map(i=>'<div class="schedule"><div class="grow"><strong>'+esc(state.sheets.find(s=>s.id===i.sheet)?.name)+'</strong><p>'+new Date(i.created).toLocaleString('pt-BR')+' · '+JSON.parse(i.rows).reduce((a,r)=>a+r.added,0)+' novos açaís</p></div><span class="tag">Conferida</span></div>').join(''): '<p class="muted tiny">Nenhuma leitura confirmada.</p>')+'</section>';
}
function settings(){
 return head('AJUSTES','Do seu jeito.','Regras da loja, leitura de fotos e cópia dos dados.')+
 '<div class="grid"><div><section class="panel"><h2>Seu combinado de pagamento</h2><ul class="feature-list"><li>Preço único: <strong>R$ 10,00 por açaí</strong>.</li><li>Compras do dia 1 ao 19: vencimento dia 20.</li><li>Compras do dia 20 ao fim do mês: 5º dia útil do mês seguinte.</li><li>Quinto dia útil: segunda a sexta, excluindo feriados.</li><li>O vencimento do dia 20 permanece no dia 20.</li><li>Listas disponíveis nos dias 18, 19 e na véspera do 5º dia útil.</li></ul><p class="tiny muted">Sem disparo automático de WhatsApp ou aviso com o aplicativo fechado. Abra Cobranças nas datas combinadas.</p></section>'+
 '<section class="panel"><h2>Feriados de Piracicaba · SP</h2><p class="tiny muted">Feriados recorrentes nacionais, de São Paulo e de Piracicaba, incluindo Sexta-feira Santa e Corpus Christi. Pontos facultativos não são excluídos. Base conferida no calendário municipal de 2026; revise alterações para outros anos.</p><a class="link tiny" target="_blank" rel="noopener noreferrer" href="https://piracicaba.sp.gov.br/servicos/calendario-de-feriados-2026/">Consultar calendário da Prefeitura ↗</a><form id="holiday-form"><label class="field">Outras datas sem cobrança<textarea name="dates" rows="4" placeholder="2027-01-04&#10;Uma data por linha, no formato ano-mês-dia">'+esc(state.extraHolidays.join('\n'))+'</textarea><small>Afeta novos lançamentos. Vencimentos de vendas já registradas permanecem preservados.</small></label><p class="error-text" role="alert"></p><button class="button secondary" type="submit">Salvar datas</button></form></section></div>'+
 '<div><section class="panel"><div class="panel-head"><h2>Reconhecimento de fotos</h2><span class="tag '+(state.geminiConfigured?'':'warn')+'">'+(state.geminiConfigured?'Gemini + OCR':'OCR disponível')+'</span></div><p class="tiny muted">A leitura principal usa o Gemini. Se houver erro, limite de uso ou falta de chave, o Tesseract OCR em português entra como reserva e processa a foto no servidor. O OCR sugere nomes, mas exige conferir e preencher as quantidades. Toda leitura passa pela sua revisão.</p><form id="key-form"><label class="field">Chave de API do Gemini<input name="key" type="password" autocomplete="off" placeholder="Cole a chave da API aqui" minlength="20" required><small>A chave fica apenas na memória do servidor durante esta execução. Não é enviada junto com backups nem salva no navegador.</small></label><p class="error-text" role="alert"></p><button class="button" type="submit">'+(state.geminiConfigured?'Trocar chave do Gemini':'Ativar Gemini')+'</button></form><p class="tiny muted">O teste real da conexão acontece ao ler a primeira foto. Para ativação permanente, configure GEMINI_API_KEY no servidor.</p></section>'+
 '<section class="panel"><h2>Seus dados, guardados</h2><p class="tiny muted">Clientes e lançamentos são salvos no banco de dados deste servidor. Faça uma cópia com frequência. As fotos são usadas para leitura e não são guardadas no aplicativo.</p><a class="button secondary full" href="/api/backup" download>↓ Baixar cópia de segurança</a><p class="tiny muted">A cópia contém nomes, telefones e valores. Guarde em um lugar privado.</p><label class="button ghost full file-button">Restaurar uma cópia<input id="restore-file" type="file" accept=".json,application/json" aria-label="Restaurar backup"></label></section>'+
 '<section class="panel"><h2>Usar no celular</h2><p class="tiny muted">O APK usa as mesmas telas e dados do computador. Acesse saidas-mary.onrender.com ou instale o APK. Funciona pela internet, com o computador desligado.</p>'+'<a class="button secondary full" href="/baixar-apk" download>↓ Baixar APK para Android</a>'+btn('Ver como começar','instructions','','ghost small')+'</section></div></div>';
}

function openModal(html){$('#modal-content').innerHTML='<button type="button" class="close" aria-label="Fechar" data-action="close">×</button>'+html;$('#modal').showModal();setTimeout(()=>$('#modal input, #modal select')?.focus(),50);}
function closeModal(){$('#modal').close();}
function formError(form,e){const target=form.querySelector('.error-text');if(target)target.textContent=e.message;else toast(e.message);}
async function submit(form,fn){const b=form.querySelector('button[type=submit]');if(b)b.disabled=true;try{await fn(new FormData(form));}catch(e){formError(form,e);}finally{if(b)b.disabled=false;}}
function customerModal(cid,afterSave){
 const c=cid?customer(cid):{name:'',phone:''};
 openModal('<h2>'+(cid?'Editar cliente':'Novo cliente')+'</h2><form id="customer-form"><label class="field">Nome e sobrenome<input name="name" maxlength="80" value="'+esc(c.name)+'" required placeholder="Ex.: Maria Oliveira"></label><label class="field">WhatsApp com DDD <small>Opcional</small><input name="phone" type="tel" inputmode="tel" value="'+esc(c.phone.replace(/^55/,''))+'" placeholder="19 99999-9999"></label><p class="error-text" role="alert"></p><div class="dialog-actions"><button type="submit" class="button">Salvar cliente</button></div></form>');
 $('#customer-form').onsubmit=e=>{e.preventDefault();submit(e.target,async f=>{const saved=await api('customers',{id:cid||undefined,name:f.get('name'),phone:f.get('phone')});closeModal();await refresh();toast('Cliente salvo.');if(afterSave)afterSave(saved.id);});};
}
function saleModal(cid){
 if(!activeCustomers().length){customerModal(undefined,saleModal);toast('Cadastre o primeiro cliente para registrar uma venda.');return;}
 const operation=id();
 openModal('<h2>Registrar venda</h2><form id="sale-form"><label class="field">Cliente<select name="customer">'+state.customers.map(c=>'<option value="'+c.id+'" '+(c.id===cid?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></label><div class="form-grid"><label class="field">Quantidade de açaís<input name="qty" type="number" min="1" max="10000" step="1" value="1" inputmode="numeric" required></label><label class="field">Data da compra<input name="purchased" type="date" value="'+state.today+'" max="'+state.today+'" required></label></div><div class="notice" id="sale-summary"></div><p class="tiny muted">Para vendas anotadas em uma folha que será fotografada, registre pela leitura da folha. Cadastrar a mesma venda das duas formas gera duplicidade.</p><p class="error-text" role="alert"></p><div class="dialog-actions"><button class="button" type="submit">Salvar venda</button></div></form>');
 const form=$('#sale-form'),summary=()=>{try{$('#sale-summary').textContent=money(Number(form.elements.qty.value)*1000)+' · Vence em '+prettyDate(dueDate(form.elements.purchased.value,state.extraHolidays));}catch{$('#sale-summary').textContent='Confira a data e a quantidade.';}};
 form.oninput=summary;summary();
 form.onsubmit=e=>{e.preventDefault();submit(form,async f=>{await api('sales',{customer:f.get('customer'),qty:Number(f.get('qty')),purchased:f.get('purchased'),operation});closeModal();await refresh();toast('Venda registrada.');});};
}
function paymentModal(cid){
 const c=customer(cid),max=balance(cid),operation=id();
 openModal('<h2>Receber de '+esc(c.name)+'</h2><p class="muted">Saldo pendente: <strong>'+money(max)+'</strong></p><form id="payment-form"><label class="field">Valor recebido (R$)<input name="value" inputmode="decimal" value="'+(max/100).toFixed(2).replace('.',',')+'" required></label><label class="field">Data do pagamento<input name="paid" type="date" value="'+state.today+'" max="'+state.today+'" required></label><p class="tiny muted">Pode registrar um pagamento parcial. O valor abate primeiro as compras com vencimento mais antigo.</p><p class="error-text" role="alert"></p><div class="dialog-actions"><button class="button green" type="submit">Confirmar pagamento</button></div></form>');
 $('#payment-form').onsubmit=e=>{e.preventDefault();submit(e.target,async f=>{const raw=String(f.get('value')).trim().replace(',','.');if(!/^\d+(\.\d{1,2})?$/.test(raw))throw Error('Use um valor como 10,00, sem pontos de milhar.');await api('payments',{customer:cid,cents:Math.round(Number(raw)*100),paid:f.get('paid'),operation});closeModal();await refresh();toast('Pagamento registrado.');});};
}
function sheetModal(){
 openModal('<h2>Começar uma nova folha</h2><p class="tiny muted">Use um nome diferente para cada folha física. Se já fotografou esta folha antes, selecione a existente.</p><form id="sheet-form"><label class="field">Identificação da folha<input name="name" placeholder="Ex.: Setembro · folha 1" maxlength="80" required></label><label class="field">Data das compras desta folha<input name="purchased" type="date" value="'+state.today+'" max="'+state.today+'" required></label><div class="notice" id="sheet-due"></div><p class="error-text" role="alert"></p><button type="submit" class="button">Criar folha</button></form>');
 const form=$('#sheet-form');const update=()=>{try{$('#sheet-due').textContent='Esta folha é para cobrança em '+prettyDate(dueDate(form.elements.purchased.value,state.extraHolidays))+'. Todas as compras nela devem pertencer a esse vencimento.';}catch{}};update();form.oninput=update;
 form.onsubmit=e=>{e.preventDefault();submit(form,async f=>{const s=await api('sheets',{name:f.get('name'),purchased:f.get('purchased')});selectedSheet=s.id;photoDate=f.get('purchased');review=null;closeModal();await refresh();toast('Folha criada. Agora escolha a foto.');});};
}
function captureReview(){
 if(!review||!$('#review-form'))return;
 const f=new FormData($('#review-form'));
 review.rows.forEach((r,i)=>{r.name=f.get('name-'+i);const choice=f.get('customer-'+i);r.createNew=choice==='__new__';r.matchConfirmed=!!choice&&!r.createNew;r.customer=r.createNew?'':choice;r.purchased=f.get('purchased-'+i);r.total=f.get('total-'+i)===''?null:Number(f.get('total-'+i));r.previous=state.totals.find(t=>t.sheet===selectedSheet&&t.customer===r.customer)?.qty||0;});
}
async function loadPhoto(file){
 if(!file)return;if(file.size>25*1024*1024)throw Error('Escolha uma foto de até 25 MB.');
 if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error('Use uma imagem JPG, PNG ou WebP.');
 const uri=URL.createObjectURL(file);
 try{
  const img=new Image();img.src=uri;await img.decode();
  if(img.width*img.height>50000000)throw Error('Imagem muito grande. Use uma resolução menor.');
  const scale=Math.min(1,2400/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
  canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);photo=canvas.toDataURL('image/jpeg',.92);review=null;render();toast('Foto selecionada. Toque em ler nomes e risquinhos.');
 }finally{URL.revokeObjectURL(uri);}
}
async function readPhoto(button){
 if(!selectedSheet)throw Error('Selecione ou crie uma folha primeiro.');
 if(!photoDate)throw Error('Informe a data das compras.');
 if(dueDate(photoDate,state.extraHolidays)!==state.sheets.find(s=>s.id===selectedSheet)?.due)throw Error('Essa data pertence a outro vencimento. Selecione a folha correta ou comece uma nova.');
 button.disabled=true;button.textContent='Lendo a folha… aguarde';$('#photo-error').textContent='';
 try{const readingSheet=selectedSheet,readingPhoto=photo;const result=await api('photos/read',{image:photo,sheet:selectedSheet});if(selectedSheet!==readingSheet||photo!==readingPhoto){toast('A folha mudou durante a leitura. Envie novamente a foto desejada.');return;}review=result;review.operation=id();if(!review.rows.length)review.rows.push({name:'',customer:'',total:null,previous:0,uncertain:true,note:'Não foi possível recuperar uma linha com segurança. Confira a foto e preencha manualmente.'});render();$('#review')?.scrollIntoView({behavior:'smooth',block:'start'});}
 catch(e){review=null;const target=$('#photo-error');if(target)target.textContent=e.message;else toast(e.message);}
 finally{button.disabled=false;button.textContent='Ler nomes e risquinhos';}
}
async function copy(text){
 try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(text);toast('Copiado! Cole no WhatsApp.');}
 catch{openModal('<h2>Copie o texto</h2><p class="tiny muted">Toque e segure para selecionar e copiar.</p><textarea id="copy-fallback" rows="8" readonly>'+esc(text)+'</textarea>');$('#copy-fallback').select();}
}
function login(){
 $('#main').innerHTML='<section class="panel login"><div class="eyebrow">AÇAÍ DA MARY</div><h1>Entre na sua loja.</h1><form id="login-form"><label class="field">Usuário<input name="username" value="CASADOACAI" autocomplete="username" required></label><label class="field">Senha da loja<input name="password" type="password" autocomplete="current-password" required></label><p class="error-text" role="alert"></p><button type="submit" class="button full">Entrar</button></form></section>';
 $('#login-form').onsubmit=async e=>{e.preventDefault();const form=e.target;await submit(form,async f=>{const response=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-Acai-App':'1'},body:JSON.stringify({username:f.get('username'),password:f.get('password')})});const data=await response.json();if(!response.ok)throw Error(data.error);await refresh();});};
}
function bindForms(){
 const ds=$('#stock-day');if(ds)ds.onchange=()=>{stockDay=ds.value;render();};
 const sf=$('#stock-form');if(sf)sf.onsubmit=e=>{e.preventDefault();submit(sf,async f=>{await api('stock/daily',{day:stockDay,cups:Number(f.get('cups'))});await refresh();toast('Copos do dia atualizados.');});};
 const s=$('#search');if(s)s.oninput=()=>{const pos=s.selectionStart;search=s.value;render();$('#search').focus();$('#search').setSelectionRange(pos,pos);};
 const d=$('#due-select');if(d)d.onchange=()=>{selectedDue=d.value;render();};
 const sh=$('#sheet-select');if(sh)sh.onchange=()=>{selectedSheet=sh.value;review=null;render();};
 const pd=$('#photo-date');if(pd)pd.onchange=()=>{photoDate=pd.value;review=null;render();};
 for(const selector of ['#gallery','#camera'])if($(selector))$(selector).onchange=async e=>{try{await loadPhoto(e.target.files[0]);}catch(err){toast(err.message);}};
 const rf=$('#review-form');
 if(rf){
  rf.oninput=()=>{captureReview();review.rows.forEach((r,i)=>{$('[data-previous="'+i+'"]').textContent=r.previous;$('[data-delta="'+i+'"]').textContent=r.total===null?'Novos: ?':'Novos: '+(r.total-r.previous)+' · '+money((r.total-r.previous)*1000);});};
  rf.onsubmit=e=>{e.preventDefault();submit(rf,async()=>{captureReview();const result=await api('photos/confirm',{draft:review.id,rows:review.rows.map(r=>({customer:r.customer,name:r.name,total:r.total,previous:r.previous,createNew:r.createNew,matchConfirmed:r.matchConfirmed,purchased:r.purchased})),purchased:photoDate,reviewed:rf.elements.reviewed.checked,operation:review.operation});review=null;photo=null;await refresh();toast(result.added+' novos açaís contabilizados · '+money(result.cents));});};
 }
 const kf=$('#key-form');if(kf)kf.onsubmit=e=>{e.preventDefault();submit(kf,async f=>{await api('vision/key',{key:f.get('key')});await refresh();toast('Conexão configurada. Envie uma foto para testar a leitura.');});};
 const hf=$('#holiday-form');if(hf)hf.onsubmit=e=>{e.preventDefault();submit(hf,async f=>{await api('holidays',{dates:String(f.get('dates')).split(/\s+/).filter(Boolean)});await refresh();toast('Datas salvas para novos lançamentos.');});};
 const restore=$('#restore-file');if(restore)restore.onchange=async e=>{
  try{
   const file=e.target.files[0];if(!file)return;if(file.size>15*1024*1024)throw Error('Backup muito grande.');
   const backup=JSON.parse(await file.text());
   openModal('<h2>Restaurar cópia de segurança?</h2><p>Isso substituirá os clientes e lançamentos atuais pelos dados do arquivo escolhido. Uma cópia dos dados atuais será guardada no servidor.</p><form id="restore-form"><label class="field">Digite RESTAURAR para confirmar<input name="confirm" required pattern="RESTAURAR"></label><p class="error-text" role="alert"></p><button class="button danger" type="submit">Restaurar dados</button></form>');
   $('#restore-form').onsubmit=ev=>{ev.preventDefault();submit(ev.target,async f=>{await api('restore',{backup,confirm:f.get('confirm')});review=null;photo=null;selectedSheet='';selectedDue='';closeModal();await refresh();toast('Cópia restaurada.');});};
  }catch(err){toast(err instanceof SyntaxError?'Esse arquivo não é um backup válido.':err.message);}
 };
}
document.addEventListener('click',async e=>{
 const due=e.target.closest('[data-due]');if(due)selectedDue=due.dataset.due;
 const button=e.target.closest('[data-action]');if(!button)return;
 const action=button.dataset.action,cid=button.dataset.id;
 try{
  if(action==='close')closeModal();
  if(action==='customer')customerModal(cid);
  if(action==='archive-customer')archiveModal(cid);
  if(action==='restore-customer'){await api('customers/archive',{id:cid,restore:true});await refresh();toast('Cliente restaurado.');}
  if(action==='complement')complementModal(cid);
  if(action==='sale'){e.preventDefault();saleModal(cid);}
  if(action==='payment')paymentModal(cid);
  if(action==='sheet')sheetModal();
  if(action==='read-photo')await readPhoto(button);
  if(action==='remove-row'){captureReview();review.rows.splice(Number(button.dataset.index),1);render();}
  if(action==='add-row'){captureReview();review.rows.push({name:'',customer:'',total:null,previous:0,uncertain:true,note:'Linha adicionada manualmente para revisão.'});render();}
  if(action==='copy-message'){const c=pendingCustomers(selectedDue).find(c=>c.id===cid);if(c)await copy(billMessage(c));}
  if(action==='copy-list')await copy('Cobranças até '+prettyDate(selectedDue)+'\n\n'+pendingCustomers(selectedDue).map(c=>c.name+' — '+money(c.balance)).join('\n')+'\n\nTotal: '+money(balance(null,selectedDue)));
  if(action==='print')window.print();
  if(action==='undo-payment'){
   openModal('<h2>Desfazer pagamento?</h2><p>O valor voltará ao saldo pendente do cliente. Use apenas para corrigir um pagamento registrado por engano.</p><form id="undo-form"><p class="error-text" role="alert"></p><button type="submit" class="button danger">Desfazer pagamento</button></form>');
   $('#undo-form').onsubmit=ev=>{ev.preventDefault();submit(ev.target,async()=>{await api('payments/undo',{id:cid});closeModal();await refresh();toast('Pagamento desfeito.');});};
  }
  if(action==='instructions')openModal('<h2>Comece por aqui</h2><ol class="feature-list"><li>Cadastre seus clientes.</li><li>Registre uma venda e confira o vencimento.</li><li>Ative a conexão de leitura em Ajustes.</li><li>Crie uma folha e fotografe suas anotações.</li><li>Confira a leitura e confirme os novos risquinhos.</li><li>Abra Cobranças para enviar as mensagens.</li></ol><p class="tiny muted">Para usar no Android fora da rede local, falta publicar o servidor com endereço HTTPS e senha de acesso.</p>');
 }catch(err){toast(err.message);}
});
window.addEventListener('hashchange',render);
window.addEventListener('online',()=>toast('Conexão restabelecida.'));
window.addEventListener('offline',()=>toast('Sem conexão. Aguarde a internet voltar antes de salvar.'));
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#install').hidden=false;});
$('#install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('#install').hidden=true;}};
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
refresh().catch(e=>{if(!$('#login-form'))$('#main').innerHTML=empty('Não foi possível abrir a loja',e.message)+'<p class="tiny muted">Confira se o servidor está ligado e recarregue a página.</p>';});
function customerPurchases(cid){
 const groups=new Map();for(const s of state.sales.filter(s=>s.customer===cid))groups.set(s.purchased,(groups.get(s.purchased)||0)+s.qty);
 return '<details><summary>Compras por data ('+groups.size+')</summary>'+([...groups].sort((a,b)=>b[0].localeCompare(a[0])).map(([d,q])=>'<div class="schedule"><span>'+prettyDate(d)+'</span><span class="right">'+q+' copo(s) · '+money(q*1000)+'</span></div>').join('')||'<p class="tiny muted">Nenhuma compra registrada.</p>')+'</details>';
}
function archivedList(){const list=state.customers.filter(c=>state.archivedCustomers?.some(a=>a.customer===c.id));return list.length?'<details class="panel"><summary>Clientes excluídos ('+list.length+')</summary><p class="tiny muted">O histórico e os valores a receber foram preservados.</p>'+list.map(c=>'<div class="schedule"><strong>'+esc(c.name)+'</strong>'+btn('Restaurar','restore-customer','data-id="'+c.id+'"','secondary small')+'</div>').join('')+'</details>':'';}
function archiveModal(cid){const c=customer(cid);openModal('<h2>Excluir '+esc(c.name)+'?</h2><p>O cliente sai da lista ativa. As compras e cobranças ficam preservadas, inclusive o saldo de '+money(balance(cid))+'. Você poderá restaurar o cadastro em Clientes excluídos.</p><form id="archive-form"><p class="error-text" role="alert"></p><button type="submit" class="button danger">Confirmar exclusão</button></form>');$('#archive-form').onsubmit=e=>{e.preventDefault();submit(e.target,async()=>{await api('customers/archive',{id:cid});closeModal();await refresh();toast('Cliente retirado da lista ativa.');});};}
function stockPage(){
 const record=state.dailyStock?.find(r=>r.day===stockDay),sold=state.sales.filter(s=>s.purchased===stockDay).reduce((n,s)=>n+s.qty,0),available=(record?.cups||0)-sold;
 return head('NO TRABALHO','Copos e complementos','Registre os copos levados e confira o que ainda está disponível.')+'<label class="field">Dia do controle<input id="stock-day" type="date" value="'+stockDay+'"></label><section class="stats"><div class="stat"><label>Copos levados</label><strong>'+(record?.cups??'—')+'</strong></div><div class="stat"><label>Vendidos no dia</label><strong>'+sold+'</strong></div><div class="stat"><label>Disponíveis para venda</label><strong>'+(record?Math.max(0,available):'—')+'</strong></div></section>'+(record&&available<0?'<div class="notice warn">Há '+(-available)+' vendas a mais que os copos informados. Confira o total levado.</div>':'')+'<section class="panel"><form id="stock-form"><label class="field">Total de copos levados neste dia<input name="cups" type="number" min="0" max="100000" step="1" required value="'+(record?.cups??'')+'"><small>Se levar mais copos, informe o novo total do dia. Vendas manuais e por foto são descontadas automaticamente pela data da compra. Sobras não passam para outro dia automaticamente.</small></label><p class="error-text" role="alert"></p><button class="button" type="submit">Salvar copos do dia</button></form></section><section class="panel"><div class="panel-head"><h2>Complementos no trabalho</h2>'+btn('＋ Complemento','complement','','secondary small')+'</div><p class="tiny muted">Informe a quantidade que ainda está no local. Atualize após uso ou reposição; os complementos não são descontados por venda.</p>'+(state.complements?.length?state.complements.map(c=>'<div class="schedule"><div class="grow"><strong>'+esc(c.name)+'</strong><p>'+c.quantity.toLocaleString('pt-BR')+' '+esc(c.unit)+' · atualizado em '+new Date(c.updated).toLocaleDateString('pt-BR')+'</p></div>'+btn('Atualizar','complement','data-id="'+c.id+'"','secondary small')+'</div>').join(''):empty('Cadastre os complementos','Ex.: leite em pó, granola ou creme.'))+'</section>';
}
function complementModal(cid){const c=state.complements?.find(c=>c.id===cid)||{name:'',quantity:0,unit:'un'};openModal('<h2>Complemento disponível</h2><form id="complement-form"><label class="field">Nome do complemento<input name="name" maxlength="80" required value="'+esc(c.name)+'" '+(cid?'readonly':'')+'></label><label class="field">Quantidade restante<input name="quantity" type="number" min="0" max="100000" step="0.001" required value="'+c.quantity+'"></label><label class="field">Unidade<select name="unit">'+['un','kg','g','L','ml'].map(u=>'<option '+(u===c.unit?'selected':'')+'>'+u+'</option>').join('')+'</select></label><p class="error-text" role="alert"></p><button type="submit" class="button">Salvar complemento</button></form>');$('#complement-form').onsubmit=e=>{e.preventDefault();submit(e.target,async f=>{await api('stock/complements',{name:f.get('name'),quantity:Number(f.get('quantity')),unit:f.get('unit')});closeModal();await refresh();toast('Quantidade atualizada.');});};}
