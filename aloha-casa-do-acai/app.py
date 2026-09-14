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
    ''')
    if not con.execute('SELECT COUNT(*) FROM ingredients').fetchone()[0]:
        rows=[('Açaí tradicional','kg',18,26.90),('Leite em pó','kg',3,31.50),('Creme de avelã','kg',2,58.90),("M&M's",'kg',1.5,48.00),('Copo 500 ml','un',80,.75),('Copo 300 ml','un',100,.58),('Granola','kg',2,19.90),('Morango','kg',4,18.00)]
        con.executemany('INSERT INTO ingredients(name,unit,stock,cost,updated_at) VALUES(?,?,?,?,?)',[(a,b,c,d,datetime.now().isoformat()) for a,b,c,d in rows])
        r500=json.dumps([{'ingredient':'Açaí tradicional','qty':0.38},{'ingredient':'Leite em pó','qty':0.03},{'ingredient':'Granola','qty':0.04},{'ingredient':'Copo 500 ml','qty':1}])
        r300=json.dumps([{'ingredient':'Açaí tradicional','qty':0.23},{'ingredient':'Leite em pó','qty':0.02},{'ingredient':'Copo 300 ml','qty':1}])
        con.executemany('INSERT INTO recipes(name,size,price,margin,items) VALUES(?,?,?,?,?)',[('Açaí 500 ml','500 ml',22,120,r500),('Açaí 300 ml','300 ml',16,120,r300)])
    con.commit(); con.close()

def rows(q, args=()):
    con=db(); out=[dict(x) for x in con.execute(q,args).fetchall()]; con.close(); return out

def recipe_cost(recipe):
    costs={x['name']:x['cost'] for x in rows('SELECT name,cost FROM ingredients')}
    return sum(costs.get(i['ingredient'],0)*float(i['qty']) for i in json.loads(recipe['items']))

@app.get('/')
def home(): return render_template('index.html')

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

@app.get('/api/recipes')
def recipes():
    out=rows('SELECT * FROM recipes WHERE active=1 ORDER BY name')
    for x in out: x['items']=json.loads(x['items']); x['cost']=round(recipe_cost(x),2); x['suggested']=round(x['cost']*(1+x['margin']/100),2)
    return jsonify(out)

@app.post('/api/recipes')
def add_recipe():
    d=request.json; con=db(); con.execute('INSERT INTO recipes(name,size,price,margin,items) VALUES(?,?,?,?,?)',(d['name'],d.get('size',''),d.get('price',0),d.get('margin',100),json.dumps(d['items']))); con.commit(); con.close(); return jsonify(ok=True)

@app.post('/api/sales')
def sale():
    d=request.json; qty=max(1,int(d.get('quantity',1))); con=db(); recipe=con.execute('SELECT * FROM recipes WHERE id=?',(d['recipe_id'],)).fetchone()
    if not recipe: return jsonify(error='Produto não encontrado'),404
    for item in json.loads(recipe['items']):
        cur=con.execute('UPDATE ingredients SET stock=stock-? WHERE name=? AND stock>=?',(float(item['qty'])*qty,item['ingredient'],float(item['qty'])*qty))
        if not cur.rowcount: con.rollback(); con.close(); return jsonify(error=f"Estoque insuficiente: {item['ingredient']}"),400
    total=float(recipe['price'])*qty; con.execute('INSERT INTO sales(recipe_id,quantity,total,created_at) VALUES(?,?,?,?)',(recipe['id'],qty,total,datetime.now().isoformat())); con.commit(); con.close(); return jsonify(ok=True,total=total)

@app.post('/api/purchases')
def purchase():
    d=request.json; con=db(); total=0
    for item in d['items']:
        total+=float(item['quantity'])*float(item['unit_cost'])
        con.execute('UPDATE ingredients SET stock=stock+?,cost=?,updated_at=? WHERE name=?',(item['quantity'],item['unit_cost'],datetime.now().isoformat(),item['ingredient']))
    con.execute('INSERT INTO purchases(supplier,created_at,total,items) VALUES(?,?,?,?)',(d.get('supplier',''),datetime.now().isoformat(),total,json.dumps(d['items']))); con.commit(); con.close(); return jsonify(ok=True,total=total)

@app.post('/api/scan-invoice')
def scan_invoice():
    f=request.files.get('file')
    if not f: return jsonify(error='Envie uma imagem da nota.'),400
    key=os.getenv('GEMINI_API_KEY','')
    if key:
        try:
            import urllib.request
            image=base64.b64encode(f.read()).decode(); prompt='Extraia itens desta nota fiscal brasileira. Retorne somente JSON: {"supplier":"", "items":[{"ingredient":"", "quantity":0, "unit":"kg|un|L", "unit_cost":0}]}. Valores devem ser custo por unidade.'
            body=json.dumps({'contents':[{'parts':[{'text':prompt},{'inline_data':{'mime_type':f.mimetype or 'image/jpeg','data':image}}]}]}).encode()
            req=urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key='+key,data=body,headers={'Content-Type':'application/json'})
            data=json.loads(urllib.request.urlopen(req,timeout=25).read())['candidates'][0]['content']['parts'][0]['text'].replace('```json','').replace('```','').strip()
            return jsonify(source='Gemini', data=json.loads(data))
        except Exception as e: fallback_error=str(e)
    try:
        import pytesseract
        from PIL import Image
        f.seek(0); text=pytesseract.image_to_string(Image.open(f),lang='por')
        return jsonify(source='OCR local',data={'supplier':'','items':[],'raw_text':text})
    except Exception:
        return jsonify(error='Não foi possível ler a nota. Cadastre os itens manualmente.', fallback=True),422

if __name__=='__main__':
    init_db(); app.run(host='0.0.0.0',port=5000,debug=True)
else: init_db()
