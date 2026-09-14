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
  stockList.innerHTML=ingredients.map(x=>`<tr><td><b>${x.name}</b></td><td class="${x.stock<2?'lowstock':''}">${x.stock} ${x.unit}</td><td>${money(x.cost)} / ${x.unit}</td><td>${new Date(x.updated_at).toLocaleDateString('pt-BR')}</td><td class="actions"><button onclick="editIngredient(${x.id})">Editar</button><button class="danger" onclick="deleteIngredient(${x.id},'${x.name.replace(/'/g,"\\'")}')">Excluir</button></td></tr>`).join('')
};

loadRecipes = async function(){
  recipes=await api('/api/recipes');
  recipeList.innerHTML=recipes.map(x=>`<article class="panel recipe"><span class="tag">${x.size||'PRODUTO'}</span><h3>${x.name}</h3><p>${x.items.length} insumo(s) na ficha técnica</p><div class="price-line"><span>Custo: <b>${money(x.cost)}</b></span><span>Venda: <b>${money(x.price)}</b></span></div><div class="actions card-actions"><button onclick="editRecipe(${x.id})">Editar receita</button><button class="danger" onclick="deleteRecipe(${x.id},'${x.name.replace(/'/g,"\\'")}')">Excluir</button></div></article>`).join('');
  saleProducts.innerHTML=recipes.map(x=>`<button class="product" onclick="selectProduct(${x.id})"><small>${x.size}</small><strong>${x.name}</strong><span>Custo ${money(x.cost)}</span><b>${money(x.price)}</b></button>`).join('')
};

async function editIngredient(id){
  await stock(); const x=ingredients.find(i=>i.id===id); editingIngredient=id;
  iName.value=x.name;iUnit.value=x.unit;iStock.value=x.stock;iCost.value=x.cost; document.querySelector('#ingredientModal h2').textContent='Editar insumo';document.querySelector('#ingredientModal').classList.add('show');
}
async function deleteIngredient(id,name){if(!confirm(`Excluir o insumo “${name}”?`))return;try{await api('/api/ingredients/'+id,{method:'DELETE'});toast('Insumo excluído.');stock();dashboard()}catch(e){toast(e.message)}}
saveIngredient = async function(e){e.preventDefault();let d={name:iName.value,unit:iUnit.value,stock:+iStock.value,cost:+iCost.value};await api(editingIngredient?'/api/ingredients/'+editingIngredient:'/api/ingredients',{method:editingIngredient?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});editingIngredient=null;closeModal('ingredientModal');toast('Insumo salvo!');stock();dashboard()}

async function editRecipe(id){
  await stock(); await loadRecipes(); const x=recipes.find(r=>r.id===id); editingRecipe=id;
  rName.value=x.name;rSize.value=x.size;rPrice.value=x.price;rMargin.value=x.margin;recipeItems.innerHTML='';x.items.forEach(i=>{addRecipeLine();let l=recipeItems.lastElementChild;l.children[0].value=i.ingredient;l.children[1].value=i.qty});document.querySelector('#recipeModal h2').textContent='Editar produto e receita';document.querySelector('#recipeModal').classList.add('show');
}
async function deleteRecipe(id,name){if(!confirm(`Excluir o produto “${name}”?`))return;await api('/api/recipes/'+id,{method:'DELETE'});toast('Produto excluído.');loadRecipes()}
saveRecipe = async function(e){e.preventDefault();let items=[...recipeItems.children].map(x=>({ingredient:x.children[0].value,qty:+x.children[1].value}));let d={name:rName.value,size:rSize.value,price:+rPrice.value,margin:+rMargin.value,items};await api(editingRecipe?'/api/recipes/'+editingRecipe:'/api/recipes',{method:editingRecipe?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});editingRecipe=null;closeModal('recipeModal');toast('Produto salvo!');loadRecipes()}

async function purchaseHistory(){let list=await api('/api/purchases');document.querySelector('#purchaseHistory').innerHTML=list.length?list.map(x=>`<div class="sale-row"><span><b>${x.supplier||'Nota sem fornecedor'}</b><br><small>${new Date(x.created_at).toLocaleDateString('pt-BR')} · ${JSON.parse(x.items).length} item(ns)</small></span><b>${money(x.total)}</b><span class="actions"><button onclick="editPurchase(${x.id})">Editar</button><button class="danger" onclick="deletePurchase(${x.id})">Excluir</button></span></div>`).join(''):'<div class="sale-row"><small>Nenhuma compra registrada.</small></div>'}
async function editPurchase(id){await stock();let list=await api('/api/purchases');let x=list.find(p=>p.id===id);editingPurchase=id;supplier.value=x.supplier||'';purchaseItems.innerHTML='';JSON.parse(x.items).forEach(i=>{addPurchaseLine();let l=purchaseItems.lastElementChild;l.children[0].value=i.ingredient;l.children[1].value=i.quantity;l.children[2].value=i.unit_cost});document.querySelector('#purchaseModal h2').textContent='Editar compra';document.querySelector('#purchaseModal').classList.add('show')}
async function deletePurchase(id){if(!confirm('Excluir esta compra e desfazer a entrada no estoque?'))return;await api('/api/purchases/'+id,{method:'DELETE'});toast('Compra excluída e estoque ajustado.');stock();purchaseHistory();dashboard()}
savePurchase = async function(e){e.preventDefault();let lines=typeof purchasePayload==='function'?purchasePayload():[...purchaseItems.children].map(x=>({ingredient:x.children[0].value,quantity:+x.children[1].value,unit_cost:+x.children[2].value}));await api(editingPurchase?'/api/purchases/'+editingPurchase:'/api/purchases',{method:editingPurchase?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({supplier:supplier.value,items:lines})});editingPurchase=null;closeModal('purchaseModal');toast('Compra salva e custos atualizados!');await stock();purchaseHistory();dashboard()}

async function salesHistory(){let list=await api('/api/sales');document.querySelector('#saleHistory').innerHTML=list.length?list.map(x=>`<div class="sale-row"><span><b>${x.name||'Produto removido'}</b><br><small>${new Date(x.created_at).toLocaleDateString('pt-BR')} · ${x.quantity} unidade(s)</small></span><b>${money(x.total)}</b><span class="actions"><button onclick="editSale(${x.id},${x.quantity})">Editar</button><button class="danger" onclick="deleteSale(${x.id})">Excluir</button></span></div>`).join(''):'<div class="sale-row"><small>Nenhuma venda lançada.</small></div>'}
async function editSale(id,oldQty){let q=prompt('Nova quantidade vendida:',oldQty);if(q===null)return;await api('/api/sales/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({quantity:+q})});toast('Venda corrigida e estoque atualizado.');salesHistory();stock();dashboard()}
async function deleteSale(id){if(!confirm('Excluir esta venda e devolver os itens ao estoque?'))return;await api('/api/sales/'+id,{method:'DELETE'});toast('Venda excluída e estoque ajustado.');salesHistory();stock();dashboard()}

setTimeout(()=>{stock();loadRecipes();purchaseHistory();salesHistory()},0);
