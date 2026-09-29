"""Durable SQLite snapshots in a dedicated Turso database, with revision checks."""
import base64
import json
import os
import sqlite3
import tempfile
from contextlib import closing
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from flask import g, jsonify, request

MAX_BYTES = 8 * 1024 * 1024

class StorageError(Exception):
    status = 503

class Conflict(StorageError):
    status = 409

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

class CloudStore:
    def __init__(self, url, token):
        parsed = urlsplit(url.replace('libsql://', 'https://', 1))
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError('Endereço Turso inválido.')
        if not token: raise ValueError('Configure TURSO_AUTH_TOKEN.')
        self.endpoint = 'https://' + parsed.netloc + '/v2/pipeline'
        self.token = token

    def sql(self, sql, args=()):
        encoded = [{'type':'integer','value':str(v)} if isinstance(v,int) else {'type':'text','value':v} for v in args]
        payload = {'requests':[{'type':'execute','stmt':{'sql':sql,'args':encoded}}, {'type':'close'}]}
        req = Request(self.endpoint, data=json.dumps(payload).encode(), headers={'Authorization':'Bearer '+self.token,'Content-Type':'application/json'}, method='POST')
        try:
            with build_opener(NoRedirect()).open(req, timeout=20) as response:
                data=json.load(response)
            result=data['results'][0]
            if result['type']!='ok': raise ValueError('remote query failed')
            result=result['response']['result']
            def decode(v):
                if v['type']=='null': return None
                return int(v['value']) if v['type']=='integer' else v['value']
            return result['affected_row_count'], [dict(zip([c['name'] for c in result['cols']], map(decode,row))) for row in result['rows']]
        except Exception:
            raise StorageError('Não foi possível confirmar o banco online. Atualize a tela antes de tentar novamente.') from None

    def ready(self):
        self.sql('CREATE TABLE IF NOT EXISTS casa_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL, previous_payload TEXT)')

    def read(self):
        _, rows=self.sql('SELECT revision,payload FROM casa_state WHERE id=1')
        if not rows: return None, None
        row=rows[0]
        try:
            data=base64.b64decode(row['payload'], validate=True)
            if len(data)>MAX_BYTES or not data.startswith(b'SQLite format 3\x00'): raise ValueError()
        except Exception:
            raise StorageError('O banco online precisa de verificação. Nenhum dado foi substituído.') from None
        return row['revision'], data

    def save(self, revision, data):
        if len(data)>MAX_BYTES: raise StorageError('O banco atingiu o limite desta versão. Solicite ampliação antes de continuar.')
        payload=base64.b64encode(data).decode('ascii')
        if revision is None:
            changed,_=self.sql('INSERT OR IGNORE INTO casa_state(id,revision,payload) VALUES(1,1,?)', (payload,))
        else:
            changed,_=self.sql('UPDATE casa_state SET previous_payload=payload,payload=?,revision=revision+1 WHERE id=1 AND revision=?', (payload,revision))
        if changed!=1: raise Conflict('Outra janela alterou os dados. Atualize a tela antes de salvar novamente.')

    def bootstrap(self, path, initialize):
        self.ready()
        for attempt in range(3):
            revision,data=self.read()
            if data is not None: Path(path).write_bytes(data)
            initialize()
            current=snapshot(path)
            if current==data: return
            try:
                self.save(revision,current)
                return
            except Conflict:
                if attempt==2: raise

def snapshot(path):
    with closing(sqlite3.connect(path)) as con:
        return con.serialize()

def configure_requests(app, store):
    @app.before_request
    def read_online_database():
        if not request.path.startswith('/api/') or request.path=='/api/login': return
        try:
            revision,data=store.read()
            if data is None: raise StorageError('Banco online não inicializado.')
            fd,path=tempfile.mkstemp(suffix='.db',prefix='casa-request-')
            os.close(fd)
            g.cloud_db=path
            g.cloud_revision=revision
            Path(path).write_bytes(data)
        except StorageError as error:
            return jsonify(error=str(error)), error.status

    @app.after_request
    def confirm_online_save(response):
        if g.get('cloud_db') and request.method in ('POST','PUT','PATCH','DELETE') and 200<=response.status_code<300:
            try:
                store.save(g.cloud_revision,snapshot(g.cloud_db))
            except StorageError as error:
                response=jsonify(error=str(error))
                response.status_code=error.status
        return response

    @app.teardown_request
    def discard_local_copy(error):
        path=g.pop('cloud_db',None)
        if path:
            try: Path(path).unlink(missing_ok=True)
            except OSError: app.logger.warning('Temporary database cleanup deferred')
