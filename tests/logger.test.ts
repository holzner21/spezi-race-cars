import Database from 'better-sqlite3';
import { Logger } from '../src/logger';
import { setDb, resetDb } from '../src/db';

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    // Use an isolated in-memory database for each test
    const memDb = new Database(':memory:');
    setDb(memDb);
    logger = new Logger('conservative', 1000);
  });

  afterEach(() => {
    resetDb();
  });

  describe('logBet', () => {
    it('should log a bet correctly', () => {
      const bet = {
        raceId: 123,
        horsePicked: 5,
        stakeAmount: 100,
        betType: 'win' as const,
        odds: 2.5,
        result: 'win' as const,
        payout: 250,
        finishOrder: [5, 2, 1, 3, 4, 6],
        newBalance: 1150
      };

      logger.logBet(bet, 'conservative');

      const logs = logger.getAllLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].horse).toBe(5);
      expect(logs[0].odds).toBe(2.5);
      expect(logs[0].result).toBe('win');
      expect(logs[0].strategy).toBe('conservative');
    });

    it('should log multiple bets sequentially', () => {
      const bet1 = {
        raceId: 123,
        horsePicked: 1,
        stakeAmount: 100,
        betType: 'win' as const,
        odds: 2.0,
        result: 'win' as const,
        payout: 200,
        finishOrder: [1, 2, 3, 4, 5, 6],
        newBalance: 1100
      };

      const bet2 = {
        raceId: 124,
        horsePicked: 3,
        stakeAmount: 110,
        betType: 'win' as const,
        odds: 3.5,
        result: 'loss' as const,
        payout: 0,
        finishOrder: [2, 1, 3, 4, 5, 6],
        newBalance: 990
      };

      logger.logBet(bet1, 'conservative');
      logger.logBet(bet2, 'conservative');

      const logs = logger.getAllLogs();
      expect(logs).toHaveLength(2);
      expect(logs[0].result).toBe('win');
      expect(logs[1].result).toBe('loss');
    });

    it('should include timestamp for each bet', () => {
      const bet = {
        raceId: 123,
        horsePicked: 1,
        stakeAmount: 100,
        betType: 'win' as const,
        odds: 2.0,
        result: 'win' as const,
        payout: 200,
        finishOrder: [1, 2, 3, 4, 5, 6],
        newBalance: 1100
      };

      logger.logBet(bet, 'greedy');

      const logs = logger.getAllLogs();
      expect(logs[0].timestamp).toBeDefined();
      expect(logs[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO date format
    });
  });

  describe('getLogFile', () => {
    it('should return a session identifier string', () => {
      const logFile = logger.getLogFile();
      expect(logFile).toContain('session-');
    });
  });

  describe('getAllLogs', () => {
    it('should return empty array for new logger', () => {
      const logs = logger.getAllLogs();
      expect(logs).toEqual([]);
    });

    it('should return all logged bets', () => {
      const bets = [
        {
          raceId: 123,
          horsePicked: 1,
          stakeAmount: 100,
          betType: 'win' as const,
          odds: 2.0,
          result: 'win' as const,
          payout: 200,
          finishOrder: [1, 2, 3, 4, 5, 6],
          newBalance: 1100
        },
        {
          raceId: 124,
          horsePicked: 2,
          stakeAmount: 110,
          betType: 'win' as const,
          odds: 1.5,
          result: 'loss' as const,
          payout: 0,
          finishOrder: [1, 2, 3, 4, 5, 6],
          newBalance: 990
        }
      ];

      bets.forEach(bet => logger.logBet(bet, 'conservative'));

      const logs = logger.getAllLogs();
      expect(logs).toHaveLength(2);
    });
  });
});
