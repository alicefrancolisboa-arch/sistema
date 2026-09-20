/* Revisão humana obrigatória: a IA sugere, a loja decide o que entra no estoque. */
let scannedInvoice = { supplier:'', items:[] };
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

invoice.onchange = async () => {
  const file = invoice.files[0]; if(!file) return;
  scanStatus.textContent='Lendo nota fiscal…';document.querySelector('#scanFeedback').innerHTML='';
  const fd=new FormData(); fd.append('file',file);
  try{
    const result=await api('/api/scan-invoice',{method:'POST',body:fd});
    scannedInvoice=result.data;
    if(!Array.isArray(result.data?.items)||!result.data.items.length){scanStatus.textContent='Nenhum produto pôde ser identificado com segurança. Tente outra foto ou preencha a compra abaixo.';document.querySelector('#scanFeedback').innerHTML=(result.data?.raw_text?'<details><summary>Ver texto lido</summary><pre style="white-space:pre-wrap">'+esc(result.data.raw_text)+'</pre></details>':'')+'<button type="button" onclick="manualScanPurchase()">Preencher compra manualmente</button>';return}
    document.querySelector('#scanItems').innerHTML=result.data.items.map((item,index)=>`<label class="scan-choice"><input type="checkbox" checked value="${index}"><span><b>${esc(item.ingredient)}</b><small>${item.quantity} ${esc(item.unit)} · ${money(item.unit_cost)} por ${esc(item.unit)}</small></span></label>`).join('');
    scanStatus.textContent=`Leitura concluída por ${result.source}. Escolha os itens da loja.`;
    document.querySelector('#scanModal').classList.add('show');
  }catch(error){scanStatus.textContent=error.message;toast(error.message)}finally{invoice.value=''}
};

function useSelectedScan(){
  const checked=[...document.querySelectorAll('#scanItems input:checked')].map(input=>scannedInvoice.items[+input.value]);
  if(!checked.length){toast('Marque pelo menos um item da loja.');return}
  editingPurchase=null;document.querySelector('#purchaseModal h2').textContent='Nova compra';
  closeModal('scanModal');
  openModal('purchaseModal'); purchaseItems.innerHTML=''; supplier.value=scannedInvoice.supplier||'';
  checked.forEach(item=>{
    addPurchaseLine(); const line=purchaseItems.lastElementChild;
    const select=line.children[0];
    if(![...select.options].some(option=>option.value===item.ingredient)) select.insertAdjacentHTML('beforeend',`<option value="${esc(item.ingredient)}">${esc(item.ingredient)} (novo insumo)</option>`);
    select.value=item.ingredient; line.children[1].value=item.quantity; line.children[2].value=item.unit_cost;
    line.dataset.unit=item.unit;
  });
}

const purchasePayload = () => [...purchaseItems.children].map(line=>({ingredient:line.children[0].value,quantity:+line.children[1].value,unit_cost:+line.children[2].value,unit:line.dataset.unit||ingredients.find(i=>i.name===line.children[0].value)?.unit||'un'}));

function manualScanPurchase(){editingPurchase=null;document.querySelector('#purchaseModal h2').textContent='Nova compra';purchaseItems.innerHTML='';openModal('purchaseModal');supplier.value=scannedInvoice?.supplier||'';}
