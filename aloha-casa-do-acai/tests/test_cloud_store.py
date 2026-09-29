import sqlite3
import tempfile
import unittest
from pathlib import Path
from contextlib import closing
from flask import Flask, g, jsonify, request
from cloud_store import CloudStore, Conflict, StorageError, configure_requests

class TestStore(CloudStore):
    def __init__(self):
        self.remote=sqlite3.connect(':memory:')
        self.remote.row_factory=sqlite3.Row
        self.fail=False
    def sql(self, sql, args=()):
        if self.fail: raise StorageError('Banco indisponível.')
        cursor=self.remote.execute(sql,args)
        rows=[dict(row) for row in cursor.fetchall()]
        self.remote.commit()
        return max(0,cursor.rowcount),rows

class CloudTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.path=Path(self.temp.name)/'local.db'
        self.store=TestStore()
        def initialize():
            with closing(sqlite3.connect(self.path)) as con:
                con.execute('CREATE TABLE IF NOT EXISTS records(value INTEGER)')
                con.commit()
        self.initialize=initialize
        self.store.bootstrap(self.path,initialize)
        self.app=Flask(__name__)
        configure_requests(self.app,self.store)
        @self.app.route('/api/records',methods=['GET','POST'])
        def records():
            with closing(sqlite3.connect(g.cloud_db)) as con:
                if request.method=='POST':
                    con.execute('INSERT INTO records VALUES(?)',(request.json['value'],))
                    con.commit()
                return jsonify([r[0] for r in con.execute('SELECT value FROM records')])
        self.client=self.app.test_client()
    def tearDown(self):
        self.store.remote.close()
        self.temp.cleanup()
    def test_survives_local_database_loss_and_restart(self):
        self.assertEqual(self.client.post('/api/records',json={'value':42}).status_code,200)
        self.path.unlink()
        self.store.bootstrap(self.path,self.initialize)
        self.assertEqual(self.client.get('/api/records').json,[42])
        with closing(sqlite3.connect(self.path)) as con:
            self.assertEqual(con.execute('SELECT value FROM records').fetchone()[0],42)
    def test_stale_writer_cannot_overwrite_new_data(self):
        revision,data=self.store.read()
        self.client.post('/api/records',json={'value':12})
        with self.assertRaises(Conflict): self.store.save(revision,data)
        self.assertEqual(self.client.get('/api/records').json,[12])
    def test_network_failure_never_reports_saved(self):
        self.store.fail=True
        self.assertEqual(self.client.post('/api/records',json={'value':99}).status_code,503)
        self.store.fail=False
        self.assertEqual(self.client.get('/api/records').json,[])
    def test_save_failure_discards_local_changes(self):
        original=self.store.save
        self.store.save=lambda *args: (_ for _ in ()).throw(StorageError('Falha ao salvar.'))
        self.assertEqual(self.client.post('/api/records',json={'value':99}).status_code,503)
        self.store.save=original
        self.assertEqual(self.client.get('/api/records').json,[])
    def test_two_clients_read_same_state(self):
        second=self.app.test_client()
        self.client.post('/api/records',json={'value':10})
        second.post('/api/records',json={'value':20})
        self.assertEqual(self.client.get('/api/records').json,[10,20])
