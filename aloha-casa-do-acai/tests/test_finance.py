import os
import sys
import tempfile
import unittest
from pathlib import Path
TEMP = tempfile.TemporaryDirectory()
os.environ['DATA_DIR'] = TEMP.name
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app as aloha
from finance import migrate

class FinanceTests(unittest.TestCase):
    def test_backup_precedes_first_migration(self):
        import sqlite3
        original_db, original_dir = aloha.DB, aloha.DATA_DIR
        try:
            with tempfile.TemporaryDirectory() as directory:
                aloha.DATA_DIR = Path(directory)
                aloha.DB = Path(directory) / 'acai.db'
                with sqlite3.connect(aloha.DB) as con:
                    con.execute('CREATE TABLE preserved_marker(value TEXT)')
                    con.execute("INSERT INTO preserved_marker VALUES('original')")
                aloha.init_db()
                snapshots = list((Path(directory) / 'backups').glob('*.db'))
                self.assertEqual(len(snapshots), 1)
                with sqlite3.connect(snapshots[0]) as con:
                    self.assertEqual(con.execute('SELECT value FROM preserved_marker').fetchone()[0], 'original')
                    self.assertIsNone(con.execute("SELECT name FROM sqlite_master WHERE name='finance_sales'").fetchone())
                aloha.init_db()
                self.assertEqual(len(list((Path(directory) / 'backups').glob('*.db'))), 1)
        finally:
            aloha.DB, aloha.DATA_DIR = original_db, original_dir

    def setUp(self):
        self.client=aloha.app.test_client()
        con=aloha.db(); migrate(con)
        for t in ('sales','purchases','finance_sales','finance_costs','finance_suggestions'):
            con.execute('DELETE FROM '+t)
        con.commit(); con.close()
    def sale(self, **extra):
        d=dict(kind='day',start='2026-09-20',end='2026-09-20',total=100,store=40,ifood=40,nine=20,ifood_net=30,nine_net=15)
        d.update(extra); return d
    def cost(self, **extra):
        d=dict(date='2026-09-20',description='Morango',category='Frutas/complementos',total=20,supplier='Feira')
        d.update(extra); return d
    def report(self,start='2026-09-20',end='2026-09-20'):
        r=self.client.get('/api/finance/report',query_string=dict(start=start,end=end)); self.assertEqual(r.status_code,200); return r.json['current']
    def test_net_profit_and_channel_totals(self):
        self.client.post('/api/finance/sales',json=self.sale())
        self.client.post('/api/finance/costs',json=self.cost())
        r=self.report(); self.assertEqual((r['gross'],r['effective'],r['costs'],r['profit']),(10000,8500,2000,6500)); self.assertFalse(r['unknown_net'])
    def test_pending_net_is_explicit(self):
        self.client.post('/api/finance/sales',json=self.sale(ifood_net=None,nine_net=None))
        r=self.report(); self.assertTrue(r['unknown_net']); self.assertTrue(r['channels']['ifood']['missing'])
    def test_fee_calculates_net(self):
        r=self.client.post('/api/finance/sales',json=self.sale(ifood_net='',ifood_fee=5))
        self.assertEqual(r.status_code,200); self.assertEqual(self.report()['channels']['ifood']['net'],3500)
    def test_inconsistent_fee_rejected(self):
        self.assertEqual(self.client.post('/api/finance/sales',json=self.sale(ifood_fee=5)).status_code,400)
    def test_total_mismatch_and_adjustment_limit(self):
        for d in (self.sale(total=102),self.sale(total=100.01),self.sale(total=102,adjustment_note='x')):
            self.assertEqual(self.client.post('/api/finance/sales',json=d).status_code,400)
        self.assertEqual(self.client.post('/api/finance/sales',json=self.sale(total=100.01,adjustment_note='Arredondamento')).status_code,200)
        self.assertEqual(self.report()['adjustment'],1)
    def test_overlap_prevents_double_count(self):
        self.client.post('/api/finance/sales',json=self.sale())
        self.assertEqual(self.client.post('/api/finance/sales',json=self.sale(kind='week',start='2026-09-17',end='2026-09-23')).status_code,400)
        self.assertEqual(self.client.post('/api/finance/sales',json=self.sale()).status_code,400)
    def test_weekly_slices_reconcile_in_cents(self):
        self.client.post('/api/finance/sales',json=self.sale(kind='week',start='2026-09-20',end='2026-09-26',total=100.01,adjustment_note='Ajuste'))
        rows=[self.report(f'2026-09-{d}',f'2026-09-{d}') for d in range(20,27)]
        whole=self.report('2026-09-20','2026-09-26')
        for key in ('gross','effective','profit','adjustment'):
            self.assertEqual(sum(r[key] for r in rows),whole[key])
        self.assertTrue(whole['prorated'])
    def test_week_must_be_seven_days(self):
        self.assertEqual(self.client.post('/api/finance/sales',json=self.sale(kind='week')).status_code,400)
    def test_edit_and_delete(self):
        for entity,payload in [('sales',self.sale()),('costs',self.cost())]:
            r=self.client.post('/api/finance/'+entity,json=payload); ident=r.json['id']
            payload['note']='Revisado'
            self.assertEqual(self.client.put(f'/api/finance/{entity}/{ident}',json=payload).status_code,200)
            self.assertEqual(self.client.get('/api/finance/'+entity).json[0]['note'],'Revisado')
            self.assertEqual(self.client.delete(f'/api/finance/{entity}/{ident}').status_code,200)
            self.assertEqual(self.client.get('/api/finance/'+entity).json,[])
        self.assertEqual(self.report()['profit'],0)
    def test_suggestions_persist_after_delete(self):
        r=self.client.post('/api/finance/costs',json=self.cost(category='Nova categoria'))
        self.client.delete('/api/finance/costs/'+str(r.json['id']))
        r=self.client.get('/api/finance/suggestions').json
        self.assertIn('Nova categoria',r['category']); self.assertIn('Morango',r['description']); self.assertIn('Feira',r['supplier'])
    def test_legacy_migration_preserves_original_and_tombstone(self):
        con=aloha.db()
        con.execute("INSERT INTO sales(id,total,created_at) VALUES(991,50,'2026-09-20T12:00:00')")
        con.execute("INSERT INTO purchases(id,total,created_at,supplier,items) VALUES(991,12,'2026-09-20T12:00:00','Antigo','[]')")
        con.commit(); before=[tuple(r) for r in con.execute('SELECT * FROM sales')]; con.close()
        r=self.report(); self.assertEqual((r['gross'],r['costs']),(5000,1200)); self.assertTrue(r['unknown_net'])
        self.assertEqual(self.report()['gross'],5000)
        entries=self.client.get('/api/finance/sales').json
        self.client.delete('/api/finance/sales/'+str(entries[0]['id']))
        self.assertEqual(self.report()['gross'],0)
        con=aloha.db(); self.assertEqual(before,[tuple(r) for r in con.execute('SELECT * FROM sales')]); con.close()
    def test_legacy_can_be_classified_without_duplication(self):
        con=aloha.db();con.execute("INSERT INTO sales(total,created_at) VALUES(100,'2026-09-20')");con.commit();con.close()
        ident=self.client.get('/api/finance/sales').json[0]['id']
        self.assertEqual(self.client.put('/api/finance/sales/'+str(ident),json=self.sale()).status_code,200)
        self.assertEqual(self.report()['channels']['unknown']['gross'],0)
    def test_invalid_numbers_dates_and_missing_record(self):
        for value in ('NaN','Infinity',-1,'bad'):
            self.assertEqual(self.client.post('/api/finance/costs',json=self.cost(total=value)).status_code,400)
        self.assertEqual(self.client.post('/api/finance/costs',json=self.cost(quantity='NaN')).status_code,400)
        self.assertEqual(self.client.post('/api/finance/costs',json=self.cost(date='2026-02-30')).status_code,400)
        self.assertEqual(self.client.delete('/api/finance/costs/9999').status_code,404)
        self.assertEqual(self.client.get('/api/finance/report?start=2026-09-20&end=2026-09-19').status_code,400)
    def test_previous_period(self):
        self.client.post('/api/finance/costs',json=self.cost(date='2026-09-19'))
        r=self.client.get('/api/finance/report?start=2026-09-20&end=2026-09-20').json
        self.assertEqual(r['previous']['costs'],2000); self.assertEqual(r['current']['costs'],0)
    def test_only_three_menus(self):
        html=self.client.get('/').text
        self.assertEqual(html.count('data-page='),3)
        self.assertNotIn('/static/app.js',html)

if __name__=='__main__': unittest.main()
