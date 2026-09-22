/* Ações de gestão: todo lançamento pode ser corrigido ou removido. */
let editingIngredient = null, editingRecipe = null, editingPurchase = null;

const baseShow = show;
show = function(id){
  baseShow(id);
  if(id==='purchases') purchaseHistory();
  if(id==='sales') salesHistory();
};

stock = async function(){
  ingredients=await api('/api/ingredients');
  const row=x=>`<tr><td><b>${x.name}</b></td><td class="${x.stock<2?'lowstock':''}">${x.stock} ${x.unit}</td><td>${money(x.cost)} / ${x.unit}</td><td>${new Date(x.updated_at).toLocaleDateString('pt-BR')}</td><td class="actions"><button onclick="editIngredient(${x.id})">Editar</button><button class="danger" onclick="deleteIngredient(${x.id},'${x.name.replace(/'/g,"\\'")}')">Excluir</button></td></tr>`;
  stockIngredients.innerHTML=ingredients.filter(x=>x.category==='insumo').map(row).join('');
  const formatQty=value=>Number(value||0).toLocaleString('pt-BR',{maximumFractionDigits:2});
  stockPackaging.innerHTML=ingredients.filter(x=>x.category==='embalagem').map(x=>{
    const total=Number(x.stock||0),size=Number(x.package_size||0),closed=size>0?Math.floor(total/size+1e-9):null,loose=size>0?Math.max(0,total-closed*size):null;
    const packageCount=closed===null?'Informe o pacote ao editar':`${formatQty(closed)} fechado(s)${loose>1e-9?` · ${formatQty(loose)} avulso(s)`:''}`;
    return `<tr><td><b>${x.name}</b></td><td>${packageCount}</td><td class="${total<2?'lowstock':''}">${formatQty(total)} un</td><td>${money(x.cost)} / un</td><td>${new Date(x.updated_at).toLocaleDateString('pt-BR')}</td><td class="actions"><button onclick="editIngredient(${x.id})">Editar</button><button class="danger" onclick="deleteIngredient(${x.id},'${x.name.replace(/'/g,"\\'")}')">Excluir</button></td></tr>`;
  }).join('');
  const list=document.querySelector('#ingredientNames');if(list)list.innerHTML=ingredients.map(x=>`<option value="${x.name}">`).join('');
};

loadRecipes = async function(){
  recipes=await api('/api/recipes');
  recipeList.innerHTML=recipes.map(x=>`<article class="panel recipe"><span class="tag">${x.size||'PRODUTO'}</span><h3>${x.name}</h3><p>${x.items.length} insumo(s) na ficha técnica</p><div class="price-line"><span>Custo: <b>${money(x.cost)}</b></span><span>Venda: <b>${money(x.price)}</b></span></div><div class="actions card-actions"><button onclick="editRecipe(${x.id})">Editar receita</button><button class="danger" onclick="deleteRecipe(${x.id},'${x.name.replace(/'/g,"\\'")}')">Excluir</button></div></article>`).join('');
  stockRules=await api('/api/stock-rules');
  recipeList.innerHTML=recipes.map(x=>{const rule=stockRules.products.find(r=>r.product_name.toLowerCase()===x.name.toLowerCase());return `<article class="panel recipe"><span class="tag">${x.size||'PRODUTO'}</span><h3>${x.name}</h3><p>${x.items.length} item(ns) na ficha técnica</p><div class="price-line"><span>Custo: <b>${money(x.cost)}</b></span><span>Venda: <b>${money(x.price)}</b></span></div>${rule?`<button type="button" onclick="openPortionRules('${rule.code}','${x.name.replace(/'/g,"\\'")}')">Configurar porções</button>`:''}<div class="actions card-actions"><button onclick="editRecipe(${x.id})">Editar receita</button><button class="danger" onclick="deleteRecipe(${x.id},'${x.name.replace(/'/g,"\\'")}')">Excluir</button></div></article>`}).join('');
  saleProducts.innerHTML=recipes.map(x=>`<button class="product" onclick="selectProduct(${x.id})"><small>${x.size}</small><strong>${x.name}</strong><span>Custo ${money(x.cost)}</span><b>${money(x.price)}</b></button>`).join('')
};

async function editIngredient(id){
  await stock(); const x=ingredients.find(i=>i.id===id); editingIngredient=id;
  iName.value=x.name;iCategory.value=x.category||'insumo';iUnit.value=x.unit;iStock.value=x.stock;iCost.value=x.cost;iPackageSize.value=x.package_size||'';togglePackageSize(); document.querySelector('#ingredientModal h2').textContent='Editar item de estoque';document.querySelector('#ingredientModal').classList.add('show');
}
function togglePackageSize(){document.querySelector('#packageSizeField').style.display=iCategory.value==='embalagem'?'grid':'none';}
async function deleteIngredient(id,name){if(!confirm(`Excluir o insumo “${name}”?`))return;try{await api('/api/ingredients/'+id,{method:'DELETE'});toast('Insumo excluído.');stock();dashboard()}catch(e){toast(e.message)}}
saveIngredient = async function(e){e.preventDefault();let d={name:iName.value,category:iCategory.value,unit:iUnit.value,stock:+iStock.value,cost:+iCost.value,package_size:+iPackageSize.value||0};await api(editingIngredient?'/api/ingredients/'+editingIngredient:'/api/ingredients',{method:editingIngredient?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});editingIngredient=null;closeModal('ingredientModal');toast('Item salvo!');stock();dashboard()}

async function editRecipe(id){
  await stock(); await loadRecipes(); const x=recipes.find(r=>r.id===id); editingRecipe=id;
  rName.value=x.name;rSize.value=x.size;rPrice.value=x.price;rMargin.value=x.margin;recipeItems.innerHTML='';x.items.forEach(i=>{addRecipeLine();let l=recipeItems.lastElementChild;l.children[0].value=i.ingredient;l.children[1].value=i.qty});document.querySelector('#recipeModal h2').textContent='Editar produto e receita';document.querySelector('#recipeModal').classList.add('show');
}
async function deleteRecipe(id,name){if(!confirm(`Excluir o produto “${name}”?`))return;await api('/api/recipes/'+id,{method:'DELETE'});toast('Produto excluído.');loadRecipes()}
saveRecipe = async function(e){e.preventDefault();let items=[...recipeItems.children].map(x=>({ingredient:x.children[0].value,qty:+x.children[1].value}));let d={name:rName.value,size:rSize.value,price:+rPrice.value,margin:+rMargin.value,items};await api(editingRecipe?'/api/recipes/'+editingRecipe:'/api/recipes',{method:editingRecipe?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});editingRecipe=null;closeModal('recipeModal');toast('Produto salvo!');loadRecipes()}

async function purchaseHistory(){let list=await api('/api/purchases');document.querySelector('#purchaseHistory').innerHTML=list.length?list.map(x=>`<div class="sale-row"><span><b>${x.supplier||'Nota sem fornecedor'}</b><br><small>${new Date(x.created_at).toLocaleDateString('pt-BR')} · ${JSON.parse(x.items).length} item(ns)</small></span><b>${money(x.total)}</b><span class="actions"><button onclick="editPurchase(${x.id})">Editar</button><button class="danger" onclick="deletePurchase(${x.id})">Excluir</button></span></div>`).join(''):'<div class="sale-row"><small>Nenhuma compra registrada.</small></div>'}
async function editPurchase(id){await stock();let list=await api('/api/purchases');let x=list.find(p=>p.id===id);editingPurchase=id;supplier.value=x.supplier||'';purchaseItems.innerHTML='';JSON.parse(x.items).forEach(item=>{addPurchaseLine();const line=purchaseItems.lastElementChild;if(item.package_count!=null)fillPurchaseLine(line,{ingredient:item.ingredient,category:item.category,package_count:item.package_count,content_per_package:item.content_per_package,unit:item.purchase_unit||item.unit,package_total:item.package_total});else fillPurchaseLine(line,{ingredient:item.ingredient,category:item.category||'insumo',package_count:1,content_per_package:item.quantity,unit:item.unit||'un',package_total:Number(item.quantity)*Number(item.unit_cost)})});document.querySelector('#purchaseModal h2').textContent='Editar compra';document.querySelector('#purchaseModal').classList.add('show')}
async function deletePurchase(id){if(!confirm('Excluir esta compra e desfazer a entrada no estoque?'))return;await api('/api/purchases/'+id,{method:'DELETE'});toast('Compra excluída e estoque ajustado.');stock();purchaseHistory();dashboard()}
savePurchase = async function(e){e.preventDefault();const form=e.target;if(form.dataset.saving==='1')return;form.dataset.saving='1';const submit=form.querySelector('button.primary');submit.disabled=true;try{await api(editingPurchase?'/api/purchases/'+editingPurchase:'/api/purchases',{method:editingPurchase?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({supplier:supplier.value,items:purchasePayload()})});editingPurchase=null;closeModal('purchaseModal');toast('Compra salva e estoque atualizado!');await stock();purchaseHistory();dashboard()}catch(error){toast(error.message)}finally{form.dataset.saving='';submit.disabled=false}}

async function salesHistory(){if(!document.querySelector('#saleHistory'))return;let list=await api('/api/sales');document.querySelector('#saleHistory').innerHTML=list.length?list.map(x=>`<div class="sale-row"><span><b>${x.name||'Produto removido'}</b><br><small>${new Date(x.created_at).toLocaleDateString('pt-BR')} · ${x.quantity} unidade(s)</small></span><b>${money(x.total)}</b><span class="actions"><button onclick="editSale(${x.id},${x.quantity})">Editar</button><button class="danger" onclick="deleteSale(${x.id})">Excluir</button></span></div>`).join(''):'<div class="sale-row"><small>Nenhuma venda lançada.</small></div>'}
async function editSale(id,oldQty){let q=prompt('Nova quantidade vendida:',oldQty);if(q===null)return;await api('/api/sales/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({quantity:+q})});toast('Venda corrigida e estoque atualizado.');salesHistory();stock();dashboard()}
async function deleteSale(id){if(!confirm('Excluir esta venda e devolver os itens ao estoque?'))return;await api('/api/sales/'+id,{method:'DELETE'});toast('Venda excluída e estoque ajustado.');salesHistory();stock();dashboard()}

setTimeout(()=>{stock();loadRecipes();purchaseHistory();salesHistory()},0);

let portionRuleCode=null;
async function openPortionRules(code,name){
  portionRuleCode=code;await loadRecipes();
  document.querySelector('#portionTitle').textContent='Porções de '+name;
  const custom=stockRules.product_complements||[];
  document.querySelector('#portionItems').innerHTML=stockRules.complements.filter(x=>x.active&&x.unit==='g').map(x=>{
    const saved=custom.find(r=>r.product_code===code&&r.ingredient_id===x.ingredient_id);
    return `<label class="portion-row">${x.name}<small>Padrão: ${x.grams_per_portion} g</small><input type="number" min="0" max="2000" step="1" data-ingredient="${x.ingredient_id}" value="${saved?saved.grams_per_portion:x.grams_per_portion}"></label>`
  }).join('');
  document.querySelector('#portionModal').classList.add('show')
}
async function savePortionRules(e){
  e.preventDefault();const items=[...document.querySelectorAll('#portionItems [data-ingredient]')].map(input=>({ingredient_id:Number(input.dataset.ingredient),grams_per_portion:Number(input.value||0)}));
  try{await api('/api/stock-rules/'+portionRuleCode+'/complements',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({items})});closeModal('portionModal');await loadRecipes();toast('Porções específicas salvas.')}catch(err){toast(err.message)}
}

renderCart=function(){
  if(!selected){cart.hidden=true;cartEmpty.hidden=false;cartEmpty.innerHTML=orderItems.length?`<b>Itens na venda</b>${orderItems.map((x,i)=>`<div class="sale-row"><span>${x.name}${x.complements.length?`<br><small>Complementos: ${x.complementNames.join(', ')}</small>`:''}</span><button type="button" class="link" onclick="removeOrderItem(${i})">Remover</button></div>`).join('')}<strong>Total: ${money(orderItems.reduce((s,x)=>s+x.price,0))}</strong><button class="primary wide" onclick="finishSale()">Finalizar venda</button>`:'Selecione um produto para começar.';return}
  cartEmpty.hidden=true;cart.hidden=false;const rule=stockRules.products.find(r=>r.product_name.toLowerCase()===selected.name.toLowerCase());const max=rule?Number(rule.max_complements):0;
  cartName.innerHTML=`${selected.name}<br><small>Escolha até ${max} porções de complemento</small>`;cartQty.textContent='1 unidade';
  const overrides=stockRules.product_complements||[];
  const choices=stockRules.complements.filter(c=>c.active).map(c=>{const custom=rule&&overrides.find(x=>x.product_code===rule.code&&x.ingredient_id===c.ingredient_id);const grams=custom?custom.grams_per_portion:c.grams_per_portion;return `<label class="sale-row" style="gap:8px"><span>${c.name} <small>(${grams} g nesta porção)</small></span><input type="number" min="0" max="${max}" value="0" data-complement="${c.ingredient_id}" data-name="${c.name}" style="width:64px"></label>`}).join('');
  cartPrice.innerHTML=`<div id="complementChoices">${max?choices:'Este produto não tem ficha de complementos cadastrada.'}</div><button class="primary wide" type="button" onclick="addSelectedToOrder()">Adicionar este item</button><hr><b>Itens na venda</b><div>${orderItems.map((x,i)=>`<div class="sale-row"><span>${x.name}${x.complementNames.length?`<br><small>${x.complementNames.join(', ')}</small>`:''}</span><button type="button" class="link" onclick="removeOrderItem(${i})">Remover</button></div>`).join('')||'<small>Nenhum item adicionado ainda.</small>'}</div><strong>Total: ${money(orderItems.reduce((s,x)=>s+x.price,0))}</strong><button class="primary wide" type="button" onclick="finishSale()" ${orderItems.length?'':'disabled'}>Finalizar venda</button>`
};
