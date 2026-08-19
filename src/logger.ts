import { getDb } from './db';
import { BetResult, RaceOdds, RaceResult } from './types';

// ---------------------------------------------------------------------------
// Legacy interface kept for backward-compatibility with Analyzer and tests
// ---------------------------------------------------------------------------
export interface LogEntry {
  timestamp: string;
  race: number;
  horse: number;
  odds: number;
  stake: number;
  result: 'win' | 'loss';
  payout: number;
  balance: number;
  strategy: string;
}

// ---------------------------------------------------------------------------
// Full race record returned when querying historical data
// ---------------------------------------------------------------------------
export interface RaceRecord {
  id: number;
  sessionId: string;
  raceId: number;
  timestamp: string;
  finishOrder: number[];
  ourResult: 'win' | 'loss';
  payout: number;
  balanceAfter: number;
  winOdds: Record<string, number>;
  placeOdds: Record<string, number>;
  exactaOdds: Record<string, Record<string, number>>;
  trifectaOdds: Record<string, Record<string, Record<string, number>>>;
  bets: BetRecord[];
}

export interface BetRecord {
  id: number;
  raceFk: number;
  horsePicked: number;
  stake: number;
  betType: string;
  oddsAtBet: number;
  strategy: string;
  balanceBefore: number | null;
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------
export class Logger {
  private sessionId: string;
  private strategy: string;

  constructor(strategy = 'unknown', startingBalance?: number) {
    this.sessionId = new Date().toISOString().replace(/[:.]/g, '-');
    this.strategy = strategy;

    const db = getDb();
    db.prepare(
      `INSERT OR IGNORE INTO sessions (session_id, started_at, strategy, starting_balance)
       VALUES (?, ?, ?, ?)`
    ).run(this.sessionId, new Date().toISOString(), strategy, startingBalance ?? null);
  }

  /**
   * Log a full race result together with the pre-race odds and the bet placed.
   * This is the primary logging method for live and dry-run modes.
   */
  logRace(
    raceId: number,
    oddsAtBetTime: RaceOdds,
    bet: BetResult,
    rawResult: RaceResult['data'],
    balanceBefore?: number
  ): void {
    const db = getDb();

    const insertRace = db.prepare(`
      INSERT INTO races
        (session_id, race_id, timestamp, finish_order, our_result, payout, balance_after,
         win_odds, place_odds, exacta_odds, trifecta_odds)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertBet = db.prepare(`
      INSERT INTO bets
        (race_fk, horse_picked, stake, bet_type, odds_at_bet, strategy, balance_before)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const doInsert = db.transaction(() => {
      const raceRow = insertRace.run(
        this.sessionId,
        raceId,
        new Date().toISOString(),
        JSON.stringify(rawResult.finish_order),
        rawResult.result,
        rawResult.payout,
        rawResult.new_balance,
        JSON.stringify(oddsAtBetTime.win),
        JSON.stringify(oddsAtBetTime.place),
        JSON.stringify(oddsAtBetTime.exacta),
        JSON.stringify(oddsAtBetTime.trifecta)
      );

      insertBet.run(
        raceRow.lastInsertRowid,
        bet.horsePicked,
        bet.stakeAmount,
        bet.betType,
        bet.odds,
        this.strategy,
        balanceBefore ?? null
      );
    });

    doInsert();
  }

  /**
   * Legacy shim: log a bet without full odds data.
   * Prefer logRace() when full API data is available.
   */
  logBet(bet: BetResult, strategy: string): void {
    const db = getDb();

    const emptyOdds = '{}';
    const insertRace = db.prepare(`
      INSERT INTO races
        (session_id, race_id, timestamp, finish_order, our_result, payout, balance_after,
         win_odds, place_odds, exacta_odds, trifecta_odds)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertBet = db.prepare(`
      INSERT INTO bets
        (race_fk, horse_picked, stake, bet_type, odds_at_bet, strategy, balance_before)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const doInsert = db.transaction(() => {
      const raceRow = insertRace.run(
        this.sessionId,
        bet.raceId,
        new Date().toISOString(),
        JSON.stringify(bet.finishOrder),
        bet.result,
        bet.payout,
        bet.newBalance,
        emptyOdds,
        emptyOdds,
        emptyOdds,
        emptyOdds
      );

      insertBet.run(
        raceRow.lastInsertRowid,
        bet.horsePicked,
        bet.stakeAmount,
        bet.betType,
        bet.odds,
        strategy,
        null
      );
    });

    doInsert();
  }

  /** Return all bets in legacy LogEntry format for backward compatibility. */
  getAllLogs(): LogEntry[] {
    return Logger.queryLegacyLogs(`WHERE r.session_id = ?`, [this.sessionId]);
  }

  getSessionId(): string {
    return this.sessionId;
  }

  /** Legacy: returns a human-readable identifier for the current session. */
  getLogFile(): string {
    return `sqlite:session-${this.sessionId}`;
  }

  // ---------------------------------------------------------------------------
  // Static helpers
  // ---------------------------------------------------------------------------

  static loadAllHistoricalLogs(): LogEntry[] {
    return Logger.queryLegacyLogs('', []);
  }

  static loadAllRaceRecords(): RaceRecord[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT r.*, b.id as bet_id, b.horse_picked, b.stake, b.bet_type,
             b.odds_at_bet, b.strategy, b.balance_before
      FROM races r
      LEFT JOIN bets b ON b.race_fk = r.id
      ORDER BY r.timestamp ASC
    `).all() as any[];

    return Logger.rowsToRaceRecords(rows);
  }

  static loadRaceRecordsBySession(sessionId: string): RaceRecord[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT r.*, b.id as bet_id, b.horse_picked, b.stake, b.bet_type,
             b.odds_at_bet, b.strategy, b.balance_before
      FROM races r
      LEFT JOIN bets b ON b.race_fk = r.id
      WHERE r.session_id = ?
      ORDER BY r.timestamp ASC
    `).all(sessionId) as any[];

    return Logger.rowsToRaceRecords(rows);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private static queryLegacyLogs(whereClause: string, params: unknown[]): LogEntry[] {
    const db = getDb();
    const sql = `
      SELECT r.timestamp, r.race_id, r.our_result, r.payout, r.balance_after,
             b.horse_picked, b.odds_at_bet, b.stake, b.strategy
      FROM races r
      LEFT JOIN bets b ON b.race_fk = r.id
      ${whereClause}
      ORDER BY r.timestamp ASC
    `;
    const rows = db.prepare(sql).all(...params) as any[];

    return rows.map(row => ({
      timestamp: row.timestamp as string,
      race: row.race_id as number,
      horse: row.horse_picked as number,
      odds: row.odds_at_bet as number,
      stake: row.stake as number,
      result: row.our_result as 'win' | 'loss',
      payout: row.payout as number,
      balance: row.balance_after as number,
      strategy: row.strategy as string
    }));
  }

  private static rowsToRaceRecords(rows: any[]): RaceRecord[] {
    const map = new Map<number, RaceRecord>();

    for (const row of rows) {
      if (!map.has(row.id)) {
        map.set(row.id, {
          id: row.id,
          sessionId: row.session_id,
          raceId: row.race_id,
          timestamp: row.timestamp,
          finishOrder: JSON.parse(row.finish_order),
          ourResult: row.our_result,
          payout: row.payout,
          balanceAfter: row.balance_after,
          winOdds: JSON.parse(row.win_odds),
          placeOdds: JSON.parse(row.place_odds),
          exactaOdds: JSON.parse(row.exacta_odds),
          trifectaOdds: JSON.parse(row.trifecta_odds),
          bets: []
        });
      }

      if (row.bet_id != null) {
        map.get(row.id)!.bets.push({
          id: row.bet_id,
          raceFk: row.id,
          horsePicked: row.horse_picked,
          stake: row.stake,
          betType: row.bet_type,
          oddsAtBet: row.odds_at_bet,
          strategy: row.strategy,
          balanceBefore: row.balance_before ?? null
        });
      }
    }

    return Array.from(map.values());
  }
}
