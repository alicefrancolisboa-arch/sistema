import json, os, sqlite3, base64
from datetime import datetime
from pathlib import Path
from flask import Flask, jsonify, render_template, request

ROOT = Path(__file__).parent
# No Render, os dados ficam no disco persistente configurado no render.yaml.
DATA_DIR = Path(os.getenv('DATA_DIR', ROOT))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB = DATA_DIR / 'acai.db'
app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 12 * 1024 * 1024
APP_USER = os.getenv('APP_USER', 'CASADOACAI')
APP_PASSWORD = os.getenv('APP_PASSWORD', '151215')

# A chave fica somente no arquivo .env local, nunca no código ou no banco.
env_file = ROOT / '.env'
if env_file.exists():
    for line in env_file.read_text(encoding='utf-8').splitlines():
        if line.startswith('GEMINI_API_KEY='):
            os.environ.setdefault('GEMINI_API_KEY', line.split('=', 1)[1].strip())

def db():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    return con

def init_db():
    con = db()
    con.executescript('''
    CREATE TABLE IF NOT EXISTS ingredients (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, unit TEXT NOT NULL, stock REAL NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS purchases (id INTEGER PRIMARY KEY, supplier TEXT, created_at TEXT, total REAL, items TEXT);
    CREATE TABLE IF NOT EXISTS recipes (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, size TEXT, price REAL, margin REAL DEFAULT 100, items TEXT NOT NULL, active INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY, recipe_id INTEGER, quantity INTEGER, total REAL, created_at TEXT);
    CREATE TABLE IF NOT EXISTS shopping_list (id INTEGER PRIMARY KEY, name TEXT NOT NULL, unit TEXT NOT NULL DEFAULT 'un', quantity REAL NOT NULL DEFAULT 1, purchased INTEGER NOT NULL DEFAULT 0, ingredient_id INTEGER, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS product_stock_rules (code TEXT PRIMARY KEY, product_name TEXT NOT NULL, acai_grams INTEGER NOT NULL, max_complements INTEGER NOT NULL, package_name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS complement_stock_rules (ingredient_id INTEGER PRIMARY KEY, grams_per_portion INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1, FOREIGN KEY(ingredient_id) REFERENCES ingredients(id));
    CREATE TABLE IF NOT EXISTS stock_movements (id INTEGER PRIMARY KEY, sale_id INTEGER, item_index INTEGER, ingredient_id INTEGER NOT NULL, quantity REAL NOT NULL, unit TEXT NOT NULL, movement_type TEXT NOT NULL, created_at TEXT NOT NULL, recipe_snapshot TEXT NOT NULL, FOREIGN KEY(ingredient_id) REFERENCES ingredients(id));
    CREATE TABLE IF NOT EXISTS sale_requests (request_id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
    ''')
    # Upgrade legacy databases without discarding prior sales.
    sale_columns={r['name'] for r in con.execute('PRAGMA table_info(sales)')}
    if 'stock_snapshot' not in sale_columns: con.execute("ALTER TABLE sales ADD COLUMN stock_snapshot TEXT NOT NULL DEFAULT '[]'")
    if 'complements' not in sale_columns: con.execute("ALTER TABLE sales ADD COLUMN complements TEXT NOT NULL DEFAULT '[]'")
    if not con.execute('SELECT COUNT(*) FROM ingredients').fetchone()[0]:
        rows=[('Açaí tradicional','kg',18,26.90),('Leite em pó','kg',3,31.50),('Creme de avelã','kg',2,58.90),("M&M's",'kg',1.5,48.00),('Copo 500 ml','un',80,.75),('Copo 300 ml','un',100,.58),('Granola','kg',2,19.90),('Morango','kg',4,18.00)]
        con.executemany('INSERT INTO ingredients(name,unit,stock,cost,updated_at) VALUES(?,?,?,?,?)',[(a,b,c,d,datetime.now().isoformat()) for a,b,c,d in rows])
        r500=json.dumps([{'ingredient':'Açaí tradicional','qty':0.38},{'ingredient':'Leite em pó','qty':0.03},{'ingredient':'Granola','qty':0.04},{'ingredient':'Copo 500 ml','qty':1}])
        r300=json.dumps([{'ingredient':'Açaí tradicional','qty':0.23},{'ingredient':'Leite em pó','qty':0.02},{'ingredient':'Copo 300 ml','qty':1}])
        con.executemany('INSERT INTO recipes(name,size,price,margin,items) VALUES(?,?,?,?,?)',[('Açaí 500 ml','500 ml',22,120,r500),('Açaí 300 ml','300 ml',16,120,r300)])
    # Cardápio oficial Aloha (mantém preços e tamanhos alinhados ao menu da loja).
    con.execute("UPDATE recipes SET name='Copo 500 ml', size='500 ml', price=27 WHERE name='Açaí 500 ml'")
    con.execute("UPDATE recipes SET name='Copo 300 ml', size='300 ml', price=16 WHERE name='Açaí 300 ml'")
    for name, unit, stock, cost in [('Copo 150 ml','un',80,.42),('Copo 200 ml','un',80,.48),('Copo 300 ml','un',100,.58),('Copo 500 ml','un',80,.75),('Bowl 500 ml','un',0,0)]:
        con.execute('INSERT OR IGNORE INTO ingredients(name,unit,stock,cost,updated_at) VALUES(?,?,?,?,?)',(name,unit,stock,cost,datetime.now().isoformat()))
    menu_recipes = [
        ('Copo 150 ml','150 ml',10, [{'ingredient':'Açaí tradicional','qty':.13},{'ingredient':'Copo 150 ml','qty':1}]),
        ('Copo 200 ml','200 ml',12, [{'ingredient':'Açaí tradicional','qty':.18},{'ingredient':'Copo 200 ml','qty':1}]),
        ('Bowl 500 ml','500 ml',25, [{'ingredient':'Açaí tradicional','qty':.40},{'ingredient':'Copo 500 ml','qty':1}]),
        ('Adicional creme de avelã','Adicional',3, [{'ingredient':'Creme de avelã','qty':.03}]),
    ]
    for name, size, price, items in menu_recipes:
        con.execute('INSERT OR IGNORE INTO recipes(name,size,price,margin,items) VALUES(?,?,?,?,?)',(name,size,price,120,json.dumps(items)))
    product_rules=[('COPO_150','Copo 150 ml',100,2,'Copo 150 ml'),('COPO_200','Copo 200 ml',140,2,'Copo 200 ml'),('COPO_300','Copo 300 ml',200,3,'Copo 300 ml'),('COPO_500','Copo 500 ml',330,4,'Copo 500 ml'),('BOWL_500','Bowl 500 ml',330,4,'Bowl 500 ml'),('BARCA_600','Barca 600 ml',380,6,'Barca 600 ml')]
    con.executemany('INSERT OR IGNORE INTO product_stock_rules(code,product_name,acai_grams,max_complements,package_name) VALUES(?,?,?,?,?)',product_rules)
    toppings=[('Leite condensado',20),('Creme de avelã',15),('Doce de leite',20),('Calda de morango',20),('Creme de leite Ninho',20),('Creme de chocolate branco',20),('Brigadeiro de maracujá',20),('Uva',25),('Morango',25),('Kiwi',25),('Banana',30),('Granola',15),('Leite em pó',15),('Sucrilhos',10),('Bis',15),('Confete',10),('Granulado',10),('Paçoca',15),('Amendoim',15)]
    for name, grams in toppings:
        row=con.execute('SELECT id FROM ingredients WHERE lower(name)=lower(?)',(name,)).fetchone()
        if not row:
            cur=con.execute('INSERT INTO ingredients(name,unit,stock,cost,updated_at) VALUES(?,?,?,?,?)',(name,'kg',0,0,datetime.now().isoformat())); ingredient_id=cur.lastrowid
        else: ingredient_id=row['id']
        con.execute('INSERT OR IGNORE INTO complement_stock_rules(ingredient_id,grams_per_portion) VALUES(?,?)',(ingredient_id,grams))
    con.execute("INSERT OR IGNORE INTO ingredients(name,unit,stock,cost,updated_at) VALUES('Barca 600 ml','un',0,0,?)",(datetime.now().isoformat(),))
    con.commit(); con.close()

def rows(q, args=()):
    con=db(); out=[dict(x) for x in con.execute(q,args).fetchall()]; con.close(); return out

def recipe_cost(recipe):
    costs={x['name']:x['cost'] for x in rows('SELECT name,cost FROM ingredients')}
    return sum(costs.get(i['ingredient'],0)*float(i['qty']) for i in json.loads(recipe['items']))

@app.get('/')
def home(): return render_template('index.html')

@app.post('/api/login')
def login():
    d=request.json or {}
    if d.get('username') == APP_USER and d.get('password') == APP_PASSWORD:
        return jsonify(ok=True, user=APP_USER)
    return jsonify(ok=False, error='Usuário ou senha inválidos.'), 401

@app.get('/api/shopping-list')
def shopping_list():
    return jsonify(rows('SELECT * FROM shopping_list ORDER BY purchased, name'))

@app.post('/api/shopping-list')
def shopping_add():
    d=request.json or {}; name=(d.get('name') or '').strip()
    if not name: return jsonify(error='Informe o item.'),400
    con=db(); con.execute('INSERT INTO shopping_list(name,unit,quantity,purchased,ingredient_id,updated_at) VALUES(?,?,?,?,?,?)',(name,d.get('unit','un'),float(d.get('quantity',1)),int(bool(d.get('purchased'))),d.get('ingredient_id'),datetime.now().isoformat())); con.commit(); con.close(); return jsonify(ok=True)

@app.route('/api/shopping-list/<int:item_id>', methods=['PUT','DELETE'])
def shopping_detail(item_id):
    con=db()
    if request.method=='DELETE': con.execute('DELETE FROM shopping_list WHERE id=?',(item_id,))
    else:
        d=request.json or {}; con.execute('UPDATE shopping_list SET name=?,unit=?,quantity=?,purchased=?,updated_at=? WHERE id=?',(d.get('name',''),d.get('unit','un'),float(d.get('quantity',1)),int(bool(d.get('purchased'))),datetime.now().isoformat(),item_id))
    con.commit(); con.close(); return jsonify(ok=True)

@app.get('/api/dashboard')
def dashboard():
    today=datetime.now().date().isoformat()
    sales=rows('SELECT COALESCE(SUM(total),0) total, COALESCE(SUM(quantity),0) qty FROM sales WHERE created_at LIKE ?', (today+'%',))[0]
    low=rows('SELECT * FROM ingredients WHERE stock < 2 ORDER BY stock')
    return jsonify(sales=sales, ingredients=len(rows('SELECT id FROM ingredients')), low=low, recent=rows('SELECT s.*, r.name FROM sales s LEFT JOIN recipes r ON r.id=s.recipe_id ORDER BY s.id DESC LIMIT 6'))

@app.route('/api/ingredients',methods=['GET','POST'])
def ingredients():
    if request.method=='GET': return jsonify(rows('SELECT * FROM ingredients ORDER BY name'))
    d=request.json; con=db(); con.execute('INSERT INTO ingredients(name,unit,stock,cost,updated_at) VALUES(?,?,?,?,?)',(d['name'],d['unit'],d.get('stock',0),d.get('cost',0),datetime.now().isoformat())); con.commit(); con.close(); return jsonify(ok=True)

@app.route('/api/ingredients/<int:item_id>', methods=['PUT','DELETE'])
def ingredient_detail(item_id):
    con=db()
    if request.method == 'DELETE':
        con.execute('DELETE FROM ingredients WHERE id=?',(item_id,)); con.commit(); con.close(); return jsonify(ok=True)
    d=request.json
    con.execute('UPDATE ingredients SET name=?,unit=?,stock=?,cost=?,updated_at=? WHERE id=?',(d['name'],d['unit'],d['stock'],d['cost'],datetime.now().isoformat(),item_id))
    con.commit(); con.close(); return jsonify(ok=True)

@app.get('/api/recipes')
def recipes():
    try:
        out=rows('SELECT * FROM recipes WHERE active=1 ORDER BY name')
        for x in out:
            # Calcula com o JSON bruto e só então o converte para a interface.
            x['cost']=round(recipe_cost(x),2); x['items']=json.loads(x['items']); x['suggested']=round(x['cost']*(1+float(x.get('margin') or 100)/100),2)
        return jsonify(out)
    except Exception as error:
        app.logger.exception('Erro ao carregar receitas')
        return jsonify(error='Não foi possível carregar os produtos.', diagnostic=type(error).__name__),500

@app.post('/api/recipes')
def add_recipe():
    d=request.json; con=db(); con.execute('INSERT INTO recipes(name,size,price,margin,items) VALUES(?,?,?,?,?)',(d['name'],d.get('size',''),d.get('price',0),d.get('margin',100),json.dumps(d['items']))); con.commit(); con.close(); return jsonify(ok=True)

@app.route('/api/recipes/<int:recipe_id>', methods=['PUT','DELETE'])
def recipe_detail(recipe_id):
    con=db()
    if request.method == 'DELETE':
        con.execute('UPDATE recipes SET active=0 WHERE id=?',(recipe_id,)); con.commit(); con.close(); return jsonify(ok=True)
    d=request.json
    con.execute('UPDATE recipes SET name=?,size=?,price=?,margin=?,items=? WHERE id=?',(d['name'],d.get('size',''),d.get('price',0),d.get('margin',100),json.dumps(d['items']),recipe_id))
    con.commit(); con.close(); return jsonify(ok=True)

@app.get('/api/stock-rules')
def stock_rules():
    con=db()
    products=[dict(x) for x in con.execute('SELECT * FROM product_stock_rules ORDER BY code')]
    toppings=[dict(x) for x in con.execute('SELECT r.ingredient_id,r.grams_per_portion,r.active,i.name,i.unit FROM complement_stock_rules r JOIN ingredients i ON i.id=r.ingredient_id ORDER BY i.name')]
    con.close(); return jsonify(products=products,complements=toppings)

@app.put('/api/stock-rules/<code>')
def update_stock_rule(code):
    d=request.json or {}; con=db()
    if 'acai_grams' in d:
        if not 0<=int(d['acai_grams'])<=5000: con.close(); return jsonify(error='Informe o peso do açaí em gramas.'),400
        if not 0<=int(d.get('max_complements',0))<=20: con.close(); return jsonify(error='Limite de complementos inválido.'),400
        package=(d.get('package_name') or '').strip()
        if package and not con.execute('SELECT 1 FROM ingredients WHERE lower(name)=lower(?)',(package,)).fetchone(): con.close(); return jsonify(error='Cadastre a embalagem antes de vinculá-la.'),400
        if package:
            cur=con.execute('UPDATE product_stock_rules SET acai_grams=?,max_complements=?,package_name=?,active=? WHERE code=?',(int(d['acai_grams']),int(d['max_complements']),package,int(bool(d.get('active',True))),code))
        else:
            cur=con.execute('UPDATE product_stock_rules SET acai_grams=?,max_complements=?,active=? WHERE code=?',(int(d['acai_grams']),int(d['max_complements']),int(bool(d.get('active',True))),code))
    else:
        try: grams=int(d['grams_per_portion']); ingredient_id=int(d['ingredient_id'])
        except (KeyError,TypeError,ValueError): con.close(); return jsonify(error='Informe o complemento e a porção em gramas.'),400
        if not 0<=grams<=2000: con.close(); return jsonify(error='Porção inválida.'),400
        cur=con.execute('UPDATE complement_stock_rules SET grams_per_portion=?,active=? WHERE ingredient_id=?',(grams,int(bool(d.get('active',True))),ingredient_id))
    con.commit(); con.close()
    if not cur.rowcount: return jsonify(error='Regra não encontrada.'),404
    return jsonify(ok=True)

@app.get('/api/stock-movements')
def stock_movements(): return jsonify(rows('SELECT m.*,i.name AS ingredient FROM stock_movements m JOIN ingredients i ON i.id=m.ingredient_id ORDER BY m.id DESC LIMIT 500'))

def product_rule(con, recipe):
    name=(recipe['name'] or '').strip().casefold()
    match=con.execute('SELECT * FROM product_stock_rules WHERE lower(product_name)=lower(?)',(recipe['name'],)).fetchone()
    if match: return match
    # Keep standard rules applicable if an operator has a slightly different menu label.
    size=(recipe['size'] or '').lower();
    if 'barca' in name or 'barca' in size: code='BARCA_600'
    elif 'bowl' in name: code='BOWL_500'
    elif '150' in name or '150' in size: code='COPO_150'
    elif '200' in name or '200' in size: code='COPO_200'
    elif '300' in name or '300' in size: code='COPO_300'
    elif '500' in name or '500' in size: code='COPO_500'
    else: return None
    return con.execute('SELECT * FROM product_stock_rules WHERE code=?',(code,)).fetchone()

def consume_stock(con, ingredient_id, delta, base_quantity, unit, sale_id, item_index, movement_type, snapshot):
    ingredient=con.execute('SELECT id,name,unit,stock FROM ingredients WHERE id=?',(ingredient_id,)).fetchone()
    if not ingredient: raise ValueError('Um ingrediente da ficha técnica não está cadastrado.')
    new_stock=float(ingredient['stock'])-delta
    if new_stock < -1e-8: raise ValueError(f"Estoque insuficiente: {ingredient['name']} (disponível {ingredient['stock']:g} {ingredient['unit']}).")
    con.execute('UPDATE ingredients SET stock=?,updated_at=? WHERE id=?',(max(0,new_stock),datetime.now().isoformat(),ingredient_id))
    con.execute('INSERT INTO stock_movements(sale_id,item_index,ingredient_id,quantity,unit,movement_type,created_at,recipe_snapshot) VALUES(?,?,?,?,?,?,?,?)',(sale_id,item_index,ingredient_id,base_quantity,unit,movement_type,datetime.now().isoformat(),json.dumps(snapshot,ensure_ascii=False)))

def reverse_sale_stock(con, sale_row, movement_type='ESTORNO_VENDA'):
    snapshot=json.loads(sale_row['stock_snapshot'] or '[]'); qty=int(sale_row['quantity'])
    recipe_snapshot=json.loads(sale_row['complements'] or '{}')
    for entry in snapshot:
        ing=con.execute('SELECT id,stock FROM ingredients WHERE id=?',(entry['ingredient_id'],)).fetchone()
        if not ing: continue
        delta=float(entry['stock_delta'])*qty
        con.execute('UPDATE ingredients SET stock=stock+?,updated_at=? WHERE id=?',(delta,datetime.now().isoformat(),entry['ingredient_id']))
        con.execute('INSERT INTO stock_movements(sale_id,item_index,ingredient_id,quantity,unit,movement_type,created_at,recipe_snapshot) VALUES(?,?,?,?,?,?,?,?)',(sale_row['id'],0,entry['ingredient_id'],float(entry['base_quantity'])*qty,entry['unit'],movement_type,datetime.now().isoformat(),json.dumps(recipe_snapshot,ensure_ascii=False)))

@app.get('/api/purchases')
def purchases_list(): return jsonify(rows('SELECT * FROM purchases ORDER BY id DESC'))

@app.route('/api/purchases/<int:purchase_id>', methods=['PUT','DELETE'])
def purchase_detail(purchase_id):
    con=db(); old=con.execute('SELECT * FROM purchases WHERE id=?',(purchase_id,)).fetchone()
    if not old: con.close(); return jsonify(error='Compra não encontrada'),404
    # Sempre desfaz a compra anterior antes de editar ou apagar para manter o estoque correto.
    for item in json.loads(old['items']): con.execute('UPDATE ingredients SET stock=stock-? WHERE name=?',(float(item['quantity']),item['ingredient']))
    if request.method == 'DELETE': con.execute('DELETE FROM purchases WHERE id=?',(purchase_id,))
    else:
        d=request.json; total=0
        for item in d['items']:
            total+=float(item['quantity'])*float(item['unit_cost'])
            con.execute('UPDATE ingredients SET stock=stock+?,cost=?,updated_at=? WHERE name=?',(item['quantity'],item['unit_cost'],datetime.now().isoformat(),item['ingredient']))
        con.execute('UPDATE purchases SET supplier=?,total=?,items=? WHERE id=?',(d.get('supplier',''),total,json.dumps(d['items']),purchase_id))
    con.commit(); con.close(); return jsonify(ok=True)

@app.post('/api/sales')
def sale():
    d=request.json or {}; con=db(); request_id=str(d.get('request_id') or '')
    try:
        if not request_id: return jsonify(error='Identificador de venda ausente. Atualize o aplicativo e tente novamente.'),400
        con.execute('BEGIN IMMEDIATE')
        if con.execute('SELECT 1 FROM sale_requests WHERE request_id=?',(request_id,)).fetchone(): con.rollback(); return jsonify(ok=True,duplicate=True)
        con.execute('INSERT INTO sale_requests(request_id,created_at) VALUES(?,?)',(request_id,datetime.now().isoformat()))
        items=d.get('items') or [{'recipe_id':d.get('recipe_id'),'quantity':d.get('quantity',1),'complements':d.get('complements',[])}]
        total=0.0; made=[]
        for index, item in enumerate(items):
            recipe=con.execute('SELECT * FROM recipes WHERE id=? AND active=1',(item.get('recipe_id'),)).fetchone()
            if not recipe: raise ValueError('Um produto selecionado não foi encontrado.')
            qty=int(item.get('quantity',1))
            if qty<1 or qty>500: raise ValueError('Quantidade de unidades inválida.')
            rule=product_rule(con,recipe); snapshot=[]; toppings=[]; recipe_snapshot={'product':recipe['name'],'product_id':recipe['id'],'quantity':qty,'recipe_items':json.loads(recipe['items'])}
            if rule:
                if not rule['active']: raise ValueError(f"A regra de estoque de {recipe['name']} está desativada.")
                topping_ids=item.get('complements') or []
                topping_ids=[int(x.get('ingredient_id')) if isinstance(x,dict) else int(x) for x in topping_ids]
                if len(topping_ids)>int(rule['max_complements']): raise ValueError(f"{recipe['name']} permite até {rule['max_complements']} complementos.")
                acai=con.execute("SELECT id,name,unit FROM ingredients WHERE lower(name) LIKE '%açaí%' OR lower(name) LIKE '%acai%' ORDER BY id LIMIT 1").fetchone()
                if not acai: raise ValueError('Cadastre o insumo Açaí tradicional para controlar as baixas.')
                acai_delta=float(rule['acai_grams'])/1000 if acai['unit'].lower() in ('kg','quilo','quilograma') else float(rule['acai_grams'])
                acai_unit='g' if acai['unit'].lower() in ('kg','quilo','quilograma') else acai['unit']
                snapshot.append({'ingredient_id':acai['id'],'name':acai['name'],'stock_delta':acai_delta,'base_quantity':int(rule['acai_grams']),'unit':acai_unit})
                selected=[]
                for ingredient_id in topping_ids:
                    topping=con.execute('SELECT r.grams_per_portion,r.active,i.id,i.name,i.unit FROM complement_stock_rules r JOIN ingredients i ON i.id=r.ingredient_id WHERE i.id=?',(ingredient_id,)).fetchone()
                    if not topping or not topping['active']: raise ValueError('Um complemento escolhido está inativo ou não foi encontrado.')
                    delta=float(topping['grams_per_portion'])/1000 if topping['unit'].lower() in ('kg','quilo','quilograma') else float(topping['grams_per_portion'])
                    topping_unit='g' if topping['unit'].lower() in ('kg','quilo','quilograma') else topping['unit']
                    snapshot.append({'ingredient_id':topping['id'],'name':topping['name'],'stock_delta':delta,'base_quantity':int(topping['grams_per_portion']),'unit':topping_unit})
                    selected.append({'ingredient_id':topping['id'],'name':topping['name'],'grams':int(topping['grams_per_portion'])})
                package=con.execute('SELECT id,name,unit FROM ingredients WHERE lower(name)=lower(?)',(rule['package_name'],)).fetchone()
                if not package: raise ValueError(f"Cadastre a embalagem {rule['package_name']} para controlar a baixa.")
                snapshot.append({'ingredient_id':package['id'],'name':package['name'],'stock_delta':1.0,'base_quantity':1,'unit':'un'})
                recipe_snapshot={'code':rule['code'],'product':recipe['name'],'acai_grams':int(rule['acai_grams']),'max_complements':int(rule['max_complements']),'package':package['name'],'complements':selected}
            else:
                # Products outside the standardized menu retain their saved recipe as their stock specification.
                for part in json.loads(recipe['items']):
                    inv=con.execute('SELECT id,name,unit FROM ingredients WHERE name=?',(part['ingredient'],)).fetchone()
                    if not inv: raise ValueError(f"Insumo não cadastrado: {part['ingredient']}")
                    delta=float(part['qty']); base=delta; unit=inv['unit']
                    snapshot.append({'ingredient_id':inv['id'],'name':inv['name'],'stock_delta':delta,'base_quantity':base,'unit':unit})
            complement_json=json.dumps(recipe_snapshot,ensure_ascii=False); snapshot_json=json.dumps(snapshot,ensure_ascii=False)
            line_total=float(recipe['price'])*qty; total+=line_total
            cur=con.execute('INSERT INTO sales(recipe_id,quantity,total,created_at,stock_snapshot,complements) VALUES(?,?,?,?,?,?)',(recipe['id'],qty,line_total,datetime.now().isoformat(),snapshot_json,complement_json)); sale_id=cur.lastrowid
            for portion in range(qty):
                for entry in snapshot:
                    consume_stock(con,entry['ingredient_id'],entry['stock_delta'],entry['base_quantity'],entry['unit'],sale_id,index,'SAIDA_VENDA',recipe_snapshot)
            made.append(sale_id)
        con.commit(); return jsonify(ok=True,total=total,sales=made)
    except ValueError as error:
        con.rollback(); return jsonify(error=str(error)),400
    except Exception:
        con.rollback(); app.logger.exception('Falha ao confirmar venda e dar baixa no estoque'); return jsonify(error='Não foi possível finalizar a venda. O estoque não foi alterado.'),500
    finally: con.close()

@app.get('/api/sales')
def sales_list(): return jsonify(rows('SELECT s.*, r.name FROM sales s LEFT JOIN recipes r ON r.id=s.recipe_id ORDER BY s.id DESC LIMIT 100'))

@app.route('/api/sales/<int:sale_id>', methods=['PUT','DELETE'])
def sale_detail(sale_id):
    con=db()
    try:
        con.execute('BEGIN IMMEDIATE'); sale=con.execute('SELECT * FROM sales WHERE id=?',(sale_id,)).fetchone()
        if not sale: con.rollback(); return jsonify(error='Venda não encontrada.'),404
        recipe=con.execute('SELECT * FROM recipes WHERE id=?',(sale['recipe_id'],)).fetchone()
        snapshot=json.loads(sale['stock_snapshot'] or '[]');
        if snapshot:
            reverse_sale_stock(con,sale)
        elif recipe:  # Restore legacy sale rows created before movement snapshots existed.
            for item in json.loads(recipe['items']): con.execute('UPDATE ingredients SET stock=stock+?,updated_at=? WHERE name=?',(float(item['qty'])*sale['quantity'],datetime.now().isoformat(),item['ingredient']))
        if request.method=='DELETE':
            con.execute('DELETE FROM sales WHERE id=?',(sale_id,)); con.commit(); return jsonify(ok=True)
        new_qty=int((request.json or {}).get('quantity',0))
        if new_qty<1 or new_qty>500: raise ValueError('Quantidade de unidades inválida.')
        if snapshot:
            details=json.loads(sale['complements'] or '{}')
            for portion in range(new_qty):
                for entry in snapshot: consume_stock(con,entry['ingredient_id'],entry['stock_delta'],entry['base_quantity'],entry['unit'],sale_id,0,'SAIDA_VENDA',details)
        elif recipe:
            for item in json.loads(recipe['items']):
                inv=con.execute('SELECT id,name,unit FROM ingredients WHERE name=?',(item['ingredient'],)).fetchone()
                if not inv: raise ValueError(f"Insumo não cadastrado: {item['ingredient']}")
                for portion in range(new_qty): consume_stock(con,inv['id'],float(item['qty']),float(item['qty']),inv['unit'],sale_id,0,'SAIDA_VENDA',{'product':recipe['name'],'legacy_recipe':json.loads(recipe['items'])})
        con.execute('UPDATE sales SET quantity=?,total=? WHERE id=?',(new_qty,float(recipe['price'])*new_qty,sale_id)); con.commit(); return jsonify(ok=True)
    except ValueError as error:
        con.rollback(); return jsonify(error=str(error)),400
    except Exception:
        con.rollback(); app.logger.exception('Falha ao estornar ou corrigir venda'); return jsonify(error='Não foi possível atualizar a venda e o estoque.'),500
    finally: con.close()

@app.post('/api/purchases')
def purchase():
    d=request.json; con=db(); total=0
    for item in d['items']:
        total+=float(item['quantity'])*float(item['unit_cost'])
        # Itens escolhidos na leitura que ainda não existem passam a ser insumos cadastrados.
        exists=con.execute('SELECT 1 FROM ingredients WHERE name=?',(item['ingredient'],)).fetchone()
        if not exists:
            con.execute('INSERT INTO ingredients(name,unit,stock,cost,updated_at) VALUES(?,?,?,?,?)',(item['ingredient'],item.get('unit','un'),0,item['unit_cost'],datetime.now().isoformat()))
        con.execute('UPDATE ingredients SET stock=stock+?,cost=?,updated_at=? WHERE name=?',(item['quantity'],item['unit_cost'],datetime.now().isoformat(),item['ingredient']))
    con.execute('INSERT INTO purchases(supplier,created_at,total,items) VALUES(?,?,?,?)',(d.get('supplier',''),datetime.now().isoformat(),total,json.dumps(d['items']))); con.commit(); con.close(); return jsonify(ok=True,total=total)

@app.post('/api/scan-invoice')
def scan_invoice():
    f=request.files.get('file')
    if not f: return jsonify(error='Envie uma imagem da nota.'),400
    key=os.getenv('GEMINI_API_KEY','')
    diagnostic = 'A chave Gemini não está configurada no servidor.' if not key else ''
    if key:
        try:
            import urllib.request
            image=base64.b64encode(f.read()).decode(); prompt='Você é um leitor de nota fiscal brasileira. Extraia todos os produtos. Retorne SOMENTE um JSON válido no formato: {"supplier":"nome do fornecedor", "items":[{"ingredient":"nome do produto", "quantity":0, "unit":"kg|un|L", "unit_cost":0}]}. Para itens vendidos por peso, quantity é o peso em kg e unit_cost é o preço por kg. Para unidades, quantity é a quantidade e unit_cost é o preço unitário. Não invente dados.'
            body=json.dumps({'contents':[{'parts':[{'text':prompt},{'inline_data':{'mime_type':f.mimetype or 'image/jpeg','data':image}}]}],'generationConfig':{'responseMimeType':'application/json'}}).encode()
            # O catálogo desta chave indica Gemini 3.6 Flash como modelo atual para visão.
            model='gemini-3.6-flash'
            models=[model,'gemini-3.6-flash-latest']
            last_error=None
            for selected_model in models:
                try:
                    req=urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/models/'+selected_model+':generateContent?key='+key,data=body,headers={'Content-Type':'application/json'})
                    for attempt in range(2):
                        try:
                            data=json.loads(urllib.request.urlopen(req,timeout=12).read())['candidates'][0]['content']['parts'][0]['text'].replace('```json','').replace('```','').strip()
                            return jsonify(source='Gemini', data=json.loads(data))
                        except Exception as retry_error:
                            last_error=retry_error
                            if getattr(retry_error,'code',None)!=503 or attempt==1: raise
                            import time; time.sleep(1)
                except Exception as attempt_error:
                    last_error=attempt_error
                    continue
            raise last_error
        except Exception as e:
            # Não expõe a chave nem o conteúdo da nota; informa apenas a classe/HTTP para suporte.
            code = getattr(e, 'code', None)
            diagnostic = f'Gemini respondeu HTTP {code}.' if code else f'Falha de conexão Gemini: {type(e).__name__}.'
    try:
        import pytesseract
        from PIL import Image
        f.seek(0); text=pytesseract.image_to_string(Image.open(f),lang='por')
        return jsonify(source='OCR local',data={'supplier':'','items':[],'raw_text':text})
    except Exception:
        return jsonify(error='Não foi possível ler a nota. Cadastre os itens manualmente.', fallback=True, diagnostic=diagnostic),422

if __name__=='__main__':
    init_db(); app.run(host='0.0.0.0',port=5000,debug=True)
else: init_db()
