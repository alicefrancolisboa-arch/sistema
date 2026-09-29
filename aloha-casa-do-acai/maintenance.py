"""One-time, user-requested operational reset before starting platform ledgers."""
import sqlite3
from contextlib import closing
from datetime import datetime

RESET_ID = 'start-platform-ledgers-20260929'

def reset_for_platform_launch(db_path, data_dir):
    with closing(sqlite3.connect(db_path)) as con:
        con.execute('CREATE TABLE IF NOT EXISTS maintenance_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
        con.commit()
        if con.execute('SELECT 1 FROM maintenance_migrations WHERE id=?', (RESET_ID,)).fetchone():
            return False
        # Backup first. A failure aborts the reset and leaves original records intact.
        folder = data_dir / 'backups'
        folder.mkdir(exist_ok=True)
        snapshot = folder / ('before-requested-reset-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '.db')
        with closing(sqlite3.connect(snapshot)) as backup:
            con.backup(backup)
        with con:
            con.execute('BEGIN IMMEDIATE')
            if con.execute('SELECT 1 FROM maintenance_migrations WHERE id=?', (RESET_ID,)).fetchone():
                return False
            for table in ('finance_sales', 'finance_costs', 'finance_suggestions',
                          'stock_movements', 'sale_requests', 'sales', 'purchases', 'shopping_list'):
                con.execute('DELETE FROM '+table)
            con.execute('UPDATE ingredients SET stock=0')
            from finance import CATEGORIES
            con.executemany('INSERT INTO finance_suggestions VALUES(?,?)', [('category', name) for name in CATEGORIES])
            con.execute('INSERT INTO maintenance_migrations VALUES(?,?)', (RESET_ID, datetime.now().isoformat()))
        return True
