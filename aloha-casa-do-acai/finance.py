"""Financial ledger: additive migration, integer cents, preserved legacy records."""
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import json
from flask import request, jsonify

CATEGORIES = ['Insumos', 'Embalagens', 'Frutas/complementos', 'Bebidas', 'Taxas', 'Aluguel', 'Energia', 'Água', 'Gás', 'Internet', 'Manutenção', 'Marketing', 'Impostos/outros']
CHANNELS = ('store', 'ifood', 'nine', 'unknown')

def cents(value):
    try:
        n = Decimal(str(value))
        if not n.is_finite() or n < 0 or n > 1000000000:
            raise ValueError()
        return int((n * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    except (InvalidOperation, ValueError, TypeError):
        raise ValueError('Informe valores válidos, positivos ou zero.')

def day(value):
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        raise ValueError('Informe uma data válida.')

def clean(value, required=False):
    value = str(value or '').strip()
    if len(value) > 1000 or (required and not value):
        raise ValueError('Preencha os campos obrigatórios (até 1.000 caracteres).')
    return value

def migrate(con):
    con.executescript('''
    CREATE TABLE IF NOT EXISTS finance_sales (
      id INTEGER PRIMARY KEY, start TEXT NOT NULL, end TEXT NOT NULL, kind TEXT NOT NULL,
      total INTEGER NOT NULL, store INTEGER NOT NULL DEFAULT 0,
      ifood INTEGER NOT NULL DEFAULT 0, nine INTEGER NOT NULL DEFAULT 0,
      unknown INTEGER NOT NULL DEFAULT 0, ifood_net INTEGER, nine_net INTEGER,
      adjustment_note TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
      source TEXT UNIQUE, deleted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS finance_costs (
      id INTEGER PRIMARY KEY, date TEXT NOT NULL, description TEXT NOT NULL,
      category TEXT NOT NULL, supplier TEXT NOT NULL DEFAULT '', quantity REAL,
      total INTEGER NOT NULL, payment TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
      source TEXT UNIQUE, deleted INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS finance_suggestions (
      kind TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,value));
    CREATE INDEX IF NOT EXISTS finance_sales_dates ON finance_sales(start,end);
    CREATE INDEX IF NOT EXISTS finance_costs_date ON finance_costs(date);
    ''')
    con.executemany('INSERT OR IGNORE INTO finance_suggestions VALUES(?,?)', [('category', x) for x in CATEGORIES])
    # Source keys are stable, including after editing/deleting the financial copy.
    # Original inventory records and their reversal snapshots are never changed.
    for r in con.execute('SELECT id,total,created_at FROM sales').fetchall():
        con.execute('INSERT OR IGNORE INTO finance_sales(start,end,kind,total,unknown,source,note) VALUES(?,?,?,?,?,?,?)',
                    (str(r['created_at'])[:10], str(r['created_at'])[:10], 'day', cents(r['total']), cents(r['total']), 'sale:'+str(r['id']), 'Histórico: canal não informado.'))
    for r in con.execute('SELECT * FROM purchases').fetchall():
        con.execute('INSERT OR IGNORE INTO finance_costs(date,description,category,supplier,total,source,note) VALUES(?,?,?,?,?,?,?)',
                    (str(r['created_at'])[:10], 'Compra histórica #'+str(r['id']), 'Insumos', r['supplier'] or '', cents(r['total']), 'purchase:'+str(r['id']), 'Compra preservada do sistema anterior.'))
    for column in ('description', 'category', 'supplier'):
        con.execute(f"INSERT OR IGNORE INTO finance_suggestions SELECT ?, {column} FROM finance_costs WHERE {column}<>''", (column,))
    con.commit()


def register_finance(app, db):
    def connection():
        con = db()
        migrate(con)
        return con

    def sale_data(d):
        start, end = day(d.get('start')), day(d.get('end', d.get('start')))
        kind = d.get('kind', 'day')
        if kind not in ('day', 'week') or (kind == 'day' and end != start) or (kind == 'week' and (end-start).days != 6):
            raise ValueError('Lançamento diário cobre um dia; semanal cobre exatamente sete dias.')
        out = dict(start=start.isoformat(), end=end.isoformat(), kind=kind)
        for field in ('total', *CHANNELS):
            out[field] = cents(d.get(field, 0))
        out['adjustment_note'] = clean(d.get('adjustment_note'))
        difference = out['total'] - sum(out[x] for x in CHANNELS)
        if abs(difference) > 100 or (difference and not out['adjustment_note']):
            raise ValueError('A soma dos canais deve bater com o total. Ajustes de até R$ 1,00 exigem justificativa.')
        for channel in ('ifood', 'nine'):
            net = d.get(channel+'_net')
            fee = d.get(channel+'_fee')
            net = None if net in (None, '') else cents(net)
            fee = None if fee in (None, '') else cents(fee)
            if fee is not None:
                if fee > out[channel]:
                    raise ValueError('A taxa não pode superar o valor bruto do canal.')
                calculated = out[channel] - fee
                if net is not None and net != calculated:
                    raise ValueError('Bruto menos taxas deve ser igual ao líquido.')
                net = calculated
            if net is not None and net > out[channel]:
                raise ValueError('O líquido não pode superar o valor bruto do canal.')
            out[channel+'_net'] = net
        out['note'] = clean(d.get('note'))
        return out

    def cost_data(d):
        quantity = d.get('quantity')
        if quantity not in (None, ''):
            try:
                quantity = float(quantity)
                if not 0 < quantity <= 1000000000: raise ValueError()
            except (ValueError, TypeError):
                raise ValueError('Informe uma quantidade maior que zero.')
        else: quantity = None
        return dict(date=day(d.get('date')).isoformat(), description=clean(d.get('description'), True),
                    category=clean(d.get('category'), True), supplier=clean(d.get('supplier')), quantity=quantity,
                    total=cents(d.get('total')), payment=clean(d.get('payment')), note=clean(d.get('note')))

    @app.route('/api/finance/<entity>', methods=['GET', 'POST'])
    @app.route('/api/finance/<entity>/<int:item_id>', methods=['PUT', 'DELETE'])
    def ledger(entity, item_id=None):
        if entity not in ('sales', 'costs'): return jsonify(error='Não encontrado.'), 404
        con = connection()
        table = 'finance_'+entity
        try:
            if request.method == 'GET':
                order = 'start' if entity == 'sales' else 'date'
                return jsonify([dict(r) for r in con.execute(f'SELECT * FROM {table} WHERE deleted=0 ORDER BY {order} DESC,id DESC')])
            con.execute('BEGIN IMMEDIATE')
            existing = con.execute(f'SELECT * FROM {table} WHERE id=? AND deleted=0', (item_id,)).fetchone() if item_id else None
            if item_id and not existing: return jsonify(error='Lançamento não encontrado.'), 404
            if request.method == 'DELETE':
                con.execute(f'UPDATE {table} SET deleted=1 WHERE id=?', (item_id,))
            else:
                d = request.get_json(silent=True)
                if not isinstance(d, dict): raise ValueError('Dados inválidos.')
                values = sale_data(d) if entity == 'sales' else cost_data(d)
                if entity == 'sales':
                    # Existing historical entries may share a day. Their dates stay fixed.
                    if existing and existing['source']:
                        if values['start'] != existing['start'] or values['end'] != existing['end']:
                            raise ValueError('Mantenha a data original da venda histórica.')
                    else:
                        overlap = con.execute('SELECT id FROM finance_sales WHERE deleted=0 AND start<=? AND end>=? AND id<>?', (values['end'], values['start'], item_id or -1)).fetchone()
                        if overlap: raise ValueError('Já há vendas nesse período. Edite o lançamento existente para não contar duas vezes.')
                if item_id:
                    con.execute(f"UPDATE {table} SET " + ','.join(k+'=?' for k in values) + ' WHERE id=?', (*values.values(), item_id))
                else:
                    cursor = con.execute(f"INSERT INTO {table} ("+','.join(values)+') VALUES ('+','.join('?' for _ in values)+')', tuple(values.values()))
                    item_id = cursor.lastrowid
                if entity == 'costs':
                    con.executemany('INSERT OR IGNORE INTO finance_suggestions VALUES(?,?)', [(k, values[k]) for k in ('description','category','supplier') if values[k]])
            con.commit()
            return jsonify(ok=True, id=item_id)
        except ValueError as error:
            con.rollback()
            return jsonify(error=str(error)), 400
        finally:
            con.close()

    @app.get('/api/finance/suggestions')
    def suggestions():
        con = connection()
        try:
            result = {k: [] for k in ('description','category','supplier')}
            for row in con.execute('SELECT * FROM finance_suggestions ORDER BY value COLLATE NOCASE'):
                result[row['kind']].append(row['value'])
            return jsonify(result)
        finally: con.close()

    @app.get('/api/finance/report')
    def report():
        try:
            start, end = day(request.args.get('start')), day(request.args.get('end'))
            if end < start or (end-start).days > 3660: raise ValueError('Escolha um período de até dez anos, com início anterior ao fim.')
            previous_end = start-timedelta(days=1)
            previous_start = previous_end-(end-start)
        except (ValueError, OverflowError) as error: return jsonify(error=str(error)), 400
        con = connection()
        try:
            sales = [dict(r) for r in con.execute('SELECT * FROM finance_sales WHERE deleted=0 AND end>=? AND start<=?', (previous_start.isoformat(),end.isoformat()))]
            costs = [dict(r) for r in con.execute('SELECT * FROM finance_costs WHERE deleted=0 AND date BETWEEN ? AND ?', (previous_start.isoformat(),end.isoformat()))]
            def summarize(a, b):
                result = dict(gross=0, costs=0, effective=0, adjustment=0, unknown_net=False, prorated=False, channels={k:dict(gross=0,net=0,missing=False) for k in CHANNELS}, categories={})
                for row in sales:
                    s,e = day(row['start']),day(row['end'])
                    lo,hi=max(a,s),min(b,e)
                    if hi<lo: continue
                    n=(e-s).days+1
                    if n>1: result['prorated']=True
                    def portion(value):
                        # Deterministic allocation of remainder cents; arbitrary slices reconcile.
                        q,r=divmod(value,n)
                        i,j=(lo-s).days,(hi-s).days+1
                        return q*(j-i)+max(0,min(j,r)-i)
                    gross=portion(row['total'])
                    result['gross']+=gross
                    for channel in CHANNELS:
                        c=result['channels'][channel]
                        c['gross']+=portion(row[channel])
                        net=row[channel] if channel=='store' else row.get(channel+'_net')
                        missing=net is None and row[channel]>0
                        c['missing'] |= missing
                        result['unknown_net'] |= missing
                        amount=portion(row[channel] if net is None else net)
                        c['net']+=amount
                        result['effective']+=amount
                    adjustment=gross-sum(portion(row[x]) for x in CHANNELS)
                    result['adjustment']+=adjustment
                    result['effective']+=adjustment
                for row in costs:
                    if a.isoformat()<=row['date']<=b.isoformat():
                        result['costs']+=row['total']
                        result['categories'][row['category']]=result['categories'].get(row['category'],0)+row['total']
                result['profit']=result['effective']-result['costs']
                return result
            return jsonify(current=summarize(start,end), previous=summarize(previous_start,previous_end), previous_start=previous_start.isoformat(), previous_end=previous_end.isoformat())
        finally: con.close()
