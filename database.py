import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'betting.db')

FAMILIES = ['Dirven', 'Verhoeven', 'Scholten', 'Jenneskens', 'Gerrits']
HORSES = [f'Paard {i}' for i in range(1, 9)]


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    conn.execute('PRAGMA journal_mode = WAL')
    return conn


def init_db():
    conn = get_db()
    with conn:
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS families (
                id   INTEGER PRIMARY KEY,
                name TEXT NOT NULL UNIQUE
            );

            CREATE TABLE IF NOT EXISTS players (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                name      TEXT NOT NULL,
                family_id INTEGER NOT NULL REFERENCES families(id)
            );

            CREATE TABLE IF NOT EXISTS horses (
                id   INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                odds REAL NOT NULL DEFAULT 8.0
            );

            CREATE TABLE IF NOT EXISTS races (
                id     INTEGER PRIMARY KEY AUTOINCREMENT,
                status TEXT NOT NULL DEFAULT 'open'
            );

            CREATE TABLE IF NOT EXISTS bets (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                race_id   INTEGER NOT NULL REFERENCES races(id),
                player_id INTEGER NOT NULL REFERENCES players(id),
                bet_type  TEXT NOT NULL,
                horse1_id INTEGER REFERENCES horses(id),
                horse2_id INTEGER REFERENCES horses(id),
                amount    REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS race_results (
                race_id  INTEGER NOT NULL REFERENCES races(id),
                horse_id INTEGER NOT NULL REFERENCES horses(id),
                position INTEGER NOT NULL,
                PRIMARY KEY (race_id, horse_id)
            );

            CREATE TABLE IF NOT EXISTS payouts (
                id     INTEGER PRIMARY KEY AUTOINCREMENT,
                bet_id INTEGER NOT NULL UNIQUE REFERENCES bets(id),
                amount REAL NOT NULL DEFAULT 0.0
            );

            -- Stores the 8 horse position predictions for an eindklassement bet.
            CREATE TABLE IF NOT EXISTS eindklassement_predictions (
                id                 INTEGER PRIMARY KEY AUTOINCREMENT,
                bet_id             INTEGER NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
                horse_id           INTEGER NOT NULL REFERENCES horses(id),
                predicted_position INTEGER NOT NULL
            );

            -- last_payout_id: the MAX(payouts.id) at the time Uitbetalen was clicked.
            -- Balance = SUM(payouts.amount) WHERE payouts.id > last_payout_id.
            CREATE TABLE IF NOT EXISTS payout_events (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at     TEXT NOT NULL DEFAULT (datetime('now')),
                last_payout_id INTEGER NOT NULL DEFAULT 0
            );
        ''')

        # Seed families
        if conn.execute('SELECT COUNT(*) FROM families').fetchone()[0] == 0:
            for fam in FAMILIES:
                conn.execute('INSERT INTO families (name) VALUES (?)', (fam,))

        # Seed horses
        if conn.execute('SELECT COUNT(*) FROM horses').fetchone()[0] == 0:
            for i, name in enumerate(HORSES, start=1):
                conn.execute('INSERT INTO horses (id, name, odds) VALUES (?, ?, 8.0)', (i, name))

        # Seed first race
        if conn.execute('SELECT COUNT(*) FROM races').fetchone()[0] == 0:
            conn.execute("INSERT INTO races (status) VALUES ('open')")

    conn.close()
