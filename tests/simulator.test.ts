import Database from 'better-sqlite3';
import { Simulator } from '../src/simulator';
import { setDb, resetDb } from '../src/db';
import { Logger } from '../src/logger';

const FULL_ODDS_RACE = {
  win: { '1': 2.0, '2': 3.5, '3': 6.0, '4': 8.0, '5': 12.0, '6': 18.0 },
  place: { '1': 1.1, '2': 1.4, '3': 1.9, '4': 2.5, '5': 3.5, '6': 5.0 },
  exacta: { '1': { '2': 5.5 } },
  trifecta: { '1': { '2': { '3': 15.0 } } }
};

function seedRaces(logger: Logger, count: number): void {
  for (let i = 0; i < count; i++) {
    const winner = ((i % 6) + 1); // deterministic: horse 1..6 rotates
    const finishOrder = [winner, ...([1, 2, 3, 4, 5, 6].filter(h => h !== winner))];

    const bet = {
      raceId: 1000 + i,
      horsePicked: 1,
      stakeAmount: 100,
      betType: 'win' as const,
      odds: 2.0,
      result: (winner === 1 ? 'win' : 'loss') as 'win' | 'loss',
      payout: winner === 1 ? 200 : 0,
      finishOrder,
      newBalance: 1000 + (winner === 1 ? 100 : -100) * (i + 1)
    };

    const rawResult = {
      response_type: 'success',
      response_code: '850',
      result: bet.result,
      finish_order: finishOrder,
      payout: bet.payout,
      new_balance: bet.newBalance,
      next_race: { race_id: 1001 + i, odds: FULL_ODDS_RACE as any }
    };

    logger.logRace(bet.raceId, FULL_ODDS_RACE as any, bet, rawResult, 1000);
  }
}

describe('Simulator', () => {
  let logger: Logger;

  beforeEach(() => {
    const memDb = new Database(':memory:');
    setDb(memDb);
    logger = new Logger('conservative', 1000);
  });

  afterEach(() => {
    resetDb();
  });

  it('returns zero bets when no race records with odds exist', () => {
    const result = Simulator.run(
      { strategy: 'conservative', minOddsThreshold: 1.5, maxOddsThreshold: 10, stakePercentage: 10 }
    );

    expect(result.betsPlaced).toBe(0);
    expect(result.totalRaces).toBe(0);
  });

  it('simulates races and tracks wins/losses', () => {
    seedRaces(logger, 12); // 12 races: horses 1..6 each wins twice

    const result = Simulator.run(
      { strategy: 'conservative', minOddsThreshold: 1.5, maxOddsThreshold: 10, stakePercentage: 10 }
    );

    expect(result.totalRaces).toBe(12);
    expect(result.betsPlaced).toBeGreaterThan(0);
    expect(result.wins + result.losses).toBe(result.betsPlaced);
  });

  it('computes correct win rate for a deterministic scenario', () => {
    // seed 6 races where horse 1 always wins
    for (let i = 0; i < 6; i++) {
      const bet = {
        raceId: 2000 + i,
        horsePicked: 1,
        stakeAmount: 100,
        betType: 'win' as const,
        odds: 2.0,
        result: 'win' as const,
        payout: 200,
        finishOrder: [1, 2, 3, 4, 5, 6],
        newBalance: 1000 + (i + 1) * 100
      };
      const rawResult = {
        response_type: 'success',
        response_code: '850',
        result: 'win' as const,
        finish_order: [1, 2, 3, 4, 5, 6],
        payout: 200,
        new_balance: bet.newBalance,
        next_race: { race_id: 2001 + i, odds: FULL_ODDS_RACE as any }
      };
      logger.logRace(bet.raceId, FULL_ODDS_RACE as any, bet, rawResult, 1000);
    }

    const result = Simulator.run(
      { strategy: 'conservative', minOddsThreshold: 1.5, maxOddsThreshold: 10, stakePercentage: 10 }
    );

    // Conservative always picks horse with lowest odds (horse 1 @ 2.0), which always wins here
    expect(result.wins).toBe(6);
    expect(result.losses).toBe(0);
    expect(result.winRate).toBe(100);
  });

  it('compare returns results for every strategy provided', () => {
    seedRaces(logger, 6);

    const comparison = Simulator.compare([
      { strategy: 'conservative', minOddsThreshold: 1.5, maxOddsThreshold: 10, stakePercentage: 10 },
      { strategy: 'greedy', minOddsThreshold: 1.5, maxOddsThreshold: 20, stakePercentage: 10 },
      { strategy: 'kelly', minOddsThreshold: 1.5, maxOddsThreshold: 20, stakePercentage: 10 }
    ]);

    expect(comparison.strategies).toHaveLength(3);
    expect(comparison.bestByROI).toBeDefined();
    expect(comparison.bestByWinRate).toBeDefined();
    expect(comparison.bestByFinalBalance).toBeDefined();
  });
});
