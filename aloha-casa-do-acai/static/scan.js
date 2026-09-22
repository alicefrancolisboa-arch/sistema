/* A leitura sugere os dados; a pessoa revisa os pacotes, a categoria e o valor total antes de lançar. */
let scannedInvoice = { supplier:'', items:[] };
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isPackaging = name => /copo|barca|bowl|embalagem|pote|tampa|colher|canudo|sacola|etiqueta|guardanapo/i.test(name||'');
function scannedLine(item){
  const name=item.ingredient||item.name||''; const unit=item.unit||item.purchase_unit||'un';
  const packages=Number(item.package_count??1); const content=Number(item.content_per_package??item.quantity??1);
  const total=Number(item.package_total??item.total_cost??(item.unit_cost!=null?Number(item.quantity??packages)*Number(item.unit_cost):0));
  return {ingredient:name,category:item.category||(isPackaging(name)?'embalagem':'insumo'),package_count:packages,content_per_package:content,unit,total};
}
invoice.onchange=async()=>{
  const file=invoice.files[0];if(!file)return;
  scanStatus.textContent='Lendo nota fiscal…';document.querySelector('#scanFeedback').innerHTML='';
  const fd=new FormData();fd.append('file',file);
  try{
    const result=await api('/api/scan-invoice',{method:'POST',body:fd});scannedInvoice=result.data||{supplier:'',items:[]};
    if(!Array.isArray(scannedInvoice.items)||!scannedInvoice.items.length){scanStatus.textContent='Não identifiquei itens com segurança. Você pode preencher a compra manualmente.';document.querySelector('#scanFeedback').innerHTML=(scannedInvoice.raw_text?'<details><summary>Ver texto reconhecido</summary><pre style="white-space:pre-wrap">'+esc(scannedInvoice.raw_text)+'</pre></details>':'')+'<button type="button" onclick="manualScanPurchase()">Preencher compra manualmente</button>';return}
    scannedInvoice.items=scannedInvoice.items.map(scannedLine);
    document.querySelector('#scanItems').innerHTML=scannedInvoice.items.map((item,index)=>`<label class="scan-choice"><input type="checkbox" checked value="${index}"><span><b>${esc(item.ingredient)}</b><small>${item.package_count} pacote(s) × ${item.content_per_package} ${esc(item.unit)} · total ${money(item.total)}</small></span></label>`).join('');
    scanStatus.textContent=`Leitura concluída por ${result.source}. Confira os tipos e valores antes de salvar.`;document.querySelector('#scanModal').classList.add('show');
  }catch(error){scanStatus.textContent=error.message;toast(error.message)}finally{invoice.value=''}
};
function fillPurchaseLine(line,item){
  const x=scannedLine(item),units={l:'L',litro:'L',litros:'L',unidade:'un',unidades:'un',grama:'g',gramas:'g'};line.querySelector('.p-name').value=x.ingredient;line.querySelector('.p-category').value=x.category;
  line.querySelector('.p-count').value=x.package_count;line.querySelector('.p-content').value=x.content_per_package;
  line.querySelector('.p-unit').value=units[String(x.unit).toLowerCase()]||x.unit;line.querySelector('.p-total').value=x.total.toFixed(2);updatePurchaseCost(line.querySelector('.p-total'));
}
function useSelectedScan(){
  const selected=[...document.querySelectorAll('#scanItems input:checked')].map(input=>scannedInvoice.items[+input.value]);
  if(!selected.length){toast('Marque pelo menos um item da loja.');return}
  editingPurchase=null;document.querySelector('#purchaseModal h2').textContent='Nova compra';closeModal('scanModal');
  openModal('purchaseModal');purchaseItems.innerHTML='';supplier.value=scannedInvoice.supplier||'';
  selected.forEach(item=>{addPurchaseLine();fillPurchaseLine(purchaseItems.lastElementChild,item)});
}
const purchasePayload=()=>[...purchaseItems.children].map(line=>({ingredient:line.querySelector('.p-name').value.trim(),category:line.querySelector('.p-category').value,package_count:+line.querySelector('.p-count').value,content_per_package:+line.querySelector('.p-content').value,unit:line.querySelector('.p-unit').value,package_total:+line.querySelector('.p-total').value}));
function manualScanPurchase(){editingPurchase=null;document.querySelector('#purchaseModal h2').textContent='Nova compra';purchaseItems.innerHTML='';openModal('purchaseModal');supplier.value=scannedInvoice?.supplier||'';}
