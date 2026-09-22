import os
import sys
import tempfile
import unittest
import json
import sqlite3
from pathlib import Path

TEMP = tempfile.TemporaryDirectory()
os.environ['DATA_DIR'] = TEMP.name
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app as aloha


class InventoryFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        aloha.app.config['TESTING'] = True

    def setUp(self):
        con = aloha.db()
        try:
            con.execute('DELETE FROM sales')
            con.execute('DELETE FROM sale_requests')
            con.execute('DELETE FROM purchases')
            con.execute('DELETE FROM product_complement_rules')
            con.execute("UPDATE ingredients SET stock=0 WHERE name='Leite condensado'")
            con.execute("UPDATE ingredients SET stock=80,cost=.75 WHERE name='Copo 500 ml'")
            con.execute("UPDATE ingredients SET stock=18000,cost=.0269 WHERE name='Açaí tradicional'")
            con.commit()
        finally:
            con.close()
        self.client = aloha.app.test_client()

    def test_purchase_converts_package_content_to_stock_units_and_cost(self):
        con = aloha.db()
        con.execute("UPDATE ingredients SET stock=0,package_size=0 WHERE name='Copo 500 ml'")
        con.commit(); con.close()
        result = self.client.post('/api/purchases', json={'supplier': 'Teste', 'items': [
            {'ingredient': 'Leite condensado', 'category': 'insumo', 'package_count': 1, 'content_per_package': 395, 'unit': 'g', 'package_total': 7.90},
            {'ingredient': 'Copo 500 ml', 'category': 'embalagem', 'package_count': 1, 'content_per_package': 50, 'unit': 'un', 'package_total': 25.00},
        ]})
        self.assertEqual(result.status_code, 200)
        inventory = {row['name']: row for row in self.client.get('/api/ingredients').json}
        self.assertEqual(inventory['Leite condensado']['category'], 'insumo')
        self.assertEqual(inventory['Leite condensado']['unit'], 'g')
        self.assertEqual(inventory['Leite condensado']['stock'], 395)
        self.assertAlmostEqual(inventory['Leite condensado']['cost'], .02)
        self.assertEqual(inventory['Copo 500 ml']['category'], 'embalagem')
        self.assertEqual(inventory['Copo 500 ml']['stock'], 50)
        self.assertEqual(inventory['Copo 500 ml']['package_size'], 50)
        self.assertAlmostEqual(inventory['Copo 500 ml']['cost'], .5)

    def test_packaging_stock_retains_package_size_when_sales_deduct_units(self):
        con = aloha.db()
        con.execute("UPDATE ingredients SET stock=0,package_size=0 WHERE name='Copo 500 ml'")
        con.commit(); con.close()
        bought = self.client.post('/api/purchases', json={'items': [
            {'ingredient': 'Copo 500 ml', 'category': 'embalagem', 'package_count': 1, 'content_per_package': 50, 'unit': 'un', 'package_total': 25.00},
        ]})
        self.assertEqual(bought.status_code, 200)
        item = next(x for x in self.client.get('/api/ingredients').json if x['name'] == 'Copo 500 ml')
        self.assertEqual((item['package_size'], item['stock']), (50, 50))
        recipe = next(row for row in self.client.get('/api/recipes').json if row['name'] == 'Copo 500 ml')
        sold = self.client.post('/api/sales', json={'request_id': 'test-cup-pack', 'items': [
            {'recipe_id': recipe['id'], 'quantity': 1, 'complements': []},
        ]})
        self.assertEqual(sold.status_code, 200, sold.json)
        item = next(x for x in self.client.get('/api/ingredients').json if x['name'] == 'Copo 500 ml')
        self.assertEqual(item['package_size'], 50)
        self.assertEqual(item['stock'], 49)

    def test_editing_package_size_and_total_recalculates_unit_cost(self):
        item = next(x for x in self.client.get('/api/ingredients').json if x['name'] == 'Copo 500 ml')
        result = self.client.put(f"/api/ingredients/{item['id']}", json={
            'name': item['name'], 'category': 'embalagem', 'unit': 'un', 'stock': 50,
            'package_size': 50, 'package_total': 25, 'cost': item['cost'],
        })
        self.assertEqual(result.status_code, 200, result.json)
        updated = next(x for x in self.client.get('/api/ingredients').json if x['name'] == 'Copo 500 ml')
        self.assertEqual(updated['package_size'], 50)
        self.assertEqual(updated['stock'], 50)
        self.assertAlmostEqual(updated['cost'], .50)

    def test_clear_one_stock_item_keeps_its_catalog_and_other_balances(self):
        con = aloha.db()
        con.execute("UPDATE ingredients SET stock=50,package_size=50 WHERE name='Copo 500 ml'")
        con.execute("UPDATE ingredients SET stock=1234 WHERE name='Açaí tradicional'")
        con.commit(); con.close()
        before = {x['id']: x for x in self.client.get('/api/ingredients').json}
        cup = next(x for x in before.values() if x['name'] == 'Copo 500 ml')
        cleared = self.client.post(f"/api/ingredients/{cup['id']}/clear-stock")
        self.assertEqual(cleared.status_code, 200, cleared.json)
        after = {x['id']: x for x in self.client.get('/api/ingredients').json}
        self.assertEqual(set(before), set(after))
        self.assertEqual(after[cup['id']]['stock'], 0)
        self.assertEqual(after[cup['id']]['package_size'], before[cup['id']]['package_size'])
        self.assertEqual(after[cup['id']]['cost'], before[cup['id']]['cost'])
        acai = next(x for x in after.values() if x['name'] == 'Açaí tradicional')
        self.assertEqual(acai['stock'], 1234)

    def test_product_specific_topping_portion_is_deducted_in_grams(self):
        self.client.post('/api/purchases', json={'items': [
            {'ingredient': 'Leite condensado', 'category': 'insumo', 'package_count': 1, 'content_per_package': 395, 'unit': 'g', 'package_total': 7.90},
        ]})
        inventory = {row['name']: row for row in self.client.get('/api/ingredients').json}
        topping_id = inventory['Leite condensado']['id']
        configured = self.client.put('/api/stock-rules/COPO_500/complements', json={'items': [
            {'ingredient_id': topping_id, 'grams_per_portion': 50},
        ]})
        self.assertEqual(configured.status_code, 200)
        recipe = next(row for row in self.client.get('/api/recipes').json if row['name'] == 'Copo 500 ml')
        sold = self.client.post('/api/sales', json={'request_id': 'test-portion', 'items': [
            {'recipe_id': recipe['id'], 'quantity': 1, 'complements': [topping_id]},
        ]})
        self.assertEqual(sold.status_code, 200, sold.json)
        inventory = {row['name']: row for row in self.client.get('/api/ingredients').json}
        self.assertEqual(inventory['Leite condensado']['stock'], 345)
        self.assertEqual(inventory['Copo 500 ml']['stock'], 79)
        self.assertEqual(inventory['Açaí tradicional']['stock'], 17670)

    def test_shopping_list_add_and_retrieve(self):
        result = self.client.post('/api/shopping-list', json={'name': 'Morango', 'unit': 'kg', 'quantity': 2})
        self.assertEqual(result.status_code, 200)
        items = self.client.get('/api/shopping-list').json
        self.assertEqual([(x['name'], x['quantity']) for x in items], [('Morango', 2)])

    def test_legacy_kilogram_data_migrates_to_grams_without_changing_value(self):
        path = Path(TEMP.name) / 'legacy.sqlite'
        con = sqlite3.connect(path)
        con.executescript('''
            CREATE TABLE ingredients (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, unit TEXT NOT NULL, stock REAL NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, updated_at TEXT);
            CREATE TABLE purchases (id INTEGER PRIMARY KEY, supplier TEXT, created_at TEXT, total REAL, items TEXT);
            CREATE TABLE recipes (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL, size TEXT, price REAL, margin REAL DEFAULT 100, items TEXT NOT NULL, active INTEGER DEFAULT 1);
            CREATE TABLE sales (id INTEGER PRIMARY KEY, recipe_id INTEGER, quantity INTEGER, total REAL, created_at TEXT, stock_snapshot TEXT, complements TEXT);
            CREATE TABLE stock_movements (id INTEGER PRIMARY KEY, sale_id INTEGER, item_index INTEGER, ingredient_id INTEGER NOT NULL, quantity REAL NOT NULL, unit TEXT NOT NULL, movement_type TEXT NOT NULL, created_at TEXT NOT NULL, recipe_snapshot TEXT NOT NULL);
        ''')
        con.executemany('INSERT INTO ingredients(id,name,unit,stock,cost) VALUES(?,?,?,?,?)', [
            (1, 'Açaí tradicional', 'kg', 10, 26.90),
            (2, 'Leite condensado', 'kg', 2, 20.00),
            (3, 'Copo 500 ml', 'un', 50, .50),
        ])
        con.execute('INSERT INTO recipes(id,name,size,price,margin,items) VALUES(1,?,?,?,?,?)', ('Copo 500 ml', '500 ml', 27, 120, json.dumps([
            {'ingredient': 'Açaí tradicional', 'qty': .33},
            {'ingredient': 'Leite condensado', 'qty': .05},
            {'ingredient': 'Copo 500 ml', 'qty': 1},
        ])))
        con.execute('INSERT INTO purchases VALUES(1,?,?,?,?)', ('Teste', '2026-09-01', 10, json.dumps([
            {'ingredient': 'Leite condensado', 'quantity': .5, 'unit_cost': 20, 'unit': 'kg'},
        ])))
        con.execute('INSERT INTO purchases VALUES(2,?,?,?,?)', ('Teste', '2026-09-02', 25, json.dumps([
            {'ingredient': 'Copo 500 ml', 'category': 'embalagem', 'quantity': 50, 'unit_cost': .5, 'unit': 'un', 'purchase_unit': 'un', 'package_count': 1, 'content_per_package': 50, 'package_total': 25},
        ])))
        con.execute('INSERT INTO sales VALUES(1,1,1,27,?,?,?)', ('2026-09-01', json.dumps([
            {'ingredient_id': 1, 'stock_delta': .33, 'base_quantity': 330, 'unit': 'g'},
            {'ingredient_id': 2, 'stock_delta': .05, 'base_quantity': 50, 'unit': 'g'},
            {'ingredient_id': 2, 'stock_delta': .002, 'base_quantity': .002, 'unit': 'kg'},
        ]), '{}'))
        con.execute("INSERT INTO stock_movements VALUES(1,1,0,2,.002,'kg','SAIDA_VENDA','2026-09-01','{}')")
        con.commit(); con.close()

        original_db = aloha.DB
        try:
            aloha.DB = path
            aloha.init_db()
            con = aloha.db()
            try:
                milk = con.execute("SELECT unit,stock,cost,category FROM ingredients WHERE name='Leite condensado'").fetchone()
                cup = con.execute("SELECT package_size FROM ingredients WHERE name='Copo 500 ml'").fetchone()
                recipe = json.loads(con.execute("SELECT items FROM recipes WHERE id=1").fetchone()['items'])
                purchase = json.loads(con.execute('SELECT items FROM purchases WHERE id=1').fetchone()['items'])[0]
                snapshot = json.loads(con.execute("SELECT stock_snapshot FROM sales WHERE id=1").fetchone()['stock_snapshot'])
                movement = con.execute('SELECT quantity,unit FROM stock_movements WHERE id=1').fetchone()
            finally:
                con.close()
            self.assertEqual(milk['unit'], 'g')
            self.assertEqual(milk['stock'], 2000)
            self.assertAlmostEqual(milk['cost'], .02)
            self.assertEqual(milk['category'], 'insumo')
            self.assertEqual(cup['package_size'], 50)
            self.assertEqual(next(x['qty'] for x in recipe if x['ingredient'] == 'Leite condensado'), 50)
            self.assertEqual(purchase['quantity'], 500)
            self.assertAlmostEqual(purchase['unit_cost'], .02)
            migrated_sale = next(x for x in snapshot if x['ingredient_id'] == 2)
            self.assertEqual(migrated_sale['stock_delta'], 50)
            self.assertEqual(migrated_sale['unit'], 'g')
            migrated_legacy_sale = next(x for x in snapshot if x['ingredient_id'] == 2 and x['base_quantity'] == 2)
            self.assertEqual(migrated_legacy_sale['stock_delta'], 2)
            self.assertEqual(migrated_legacy_sale['unit'], 'g')
            self.assertEqual(movement['quantity'], 2)
            self.assertEqual(movement['unit'], 'g')
        finally:
            aloha.DB = original_db


if __name__ == '__main__':
    unittest.main()
