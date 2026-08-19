import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

let _db: Database.Database | null = null;

export function getDb(dbPath?: string): Database.Database {
  if (_db) return _db;

  const dir = path.join(process.cwd(), '.betting-logs');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const file = dbPath ?? path.join(dir, 'races.db');
  _db = new Database(file);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  migrate(_db);
  return _db;
}

/** For tests: reset the singleton so a new in-memory DB can be injected. */
export function resetDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/** Inject a pre-opened DB instance (used in tests). */
export function setDb(db: Database.Database): void {
  resetDb();
  migrate(db);
  _db = db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  TEXT    UNIQUE NOT NULL,
      started_at  TEXT    NOT NULL,
      strategy    TEXT    NOT NULL,
      starting_balance REAL
    );

    CREATE TABLE IF NOT EXISTS races (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id   TEXT    NOT NULL,
      race_id      INTEGER NOT NULL,
      timestamp    TEXT    NOT NULL,
      finish_order TEXT    NOT NULL,  -- JSON array e.g. "[3,5,1,2,6,4]"
      our_result   TEXT    NOT NULL,  -- 'win' | 'loss'
      payout       REAL    NOT NULL,
      balance_after REAL   NOT NULL,
      win_odds     TEXT    NOT NULL,  -- JSON {"1": 2.5, "2": 3.0, ...}
      place_odds   TEXT    NOT NULL,  -- JSON
      exacta_odds  TEXT    NOT NULL,  -- JSON nested
      trifecta_odds TEXT   NOT NULL   -- JSON nested
    );

    CREATE INDEX IF NOT EXISTS idx_races_session  ON races(session_id);
    CREATE INDEX IF NOT EXISTS idx_races_race_id  ON races(race_id);
    CREATE INDEX IF NOT EXISTS idx_races_timestamp ON races(timestamp);

    CREATE TABLE IF NOT EXISTS bets (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      race_fk       INTEGER NOT NULL REFERENCES races(id),
      horse_picked  INTEGER NOT NULL,
      stake         REAL    NOT NULL,
      bet_type      TEXT    NOT NULL,
      odds_at_bet   REAL    NOT NULL,
      strategy      TEXT    NOT NULL,
      balance_before REAL
    );

    CREATE INDEX IF NOT EXISTS idx_bets_race ON bets(race_fk);
  `);
}
