import { Analyzer } from '../src/analyzer';
import { Logger, LogEntry } from '../src/logger';

describe('Analyzer', () => {
  describe('analyzeHistoricalData', () => {
    it('should return empty report when no historical data', () => {
      jest.spyOn(Logger, 'loadAllHistoricalLogs').mockReturnValue([]);

      const report = Analyzer.analyzeHistoricalData();

      expect(report.totalBets).toBe(0);
      expect(report.totalWins).toBe(0);
      expect(report.overallWinRate).toBe(0);
      expect(report.horseStats).toHaveLength(0);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it('should calculate overall statistics correctly', () => {
      // Mock historical logs
      const mockLogs: LogEntry[] = [
        {
          timestamp: '2026-08-18T10:00:00Z',
          race: 1,
          horse: 1,
          odds: 2.0,
          stake: 100,
          result: 'win',
          payout: 200,
          balance: 1100,
          strategy: 'conservative'
        },
        {
          timestamp: '2026-08-18T10:05:00Z',
          race: 2,
          horse: 2,
          odds: 3.0,
          stake: 100,
          result: 'loss',
          payout: 0,
          balance: 1000,
          strategy: 'conservative'
        },
        {
          timestamp: '2026-08-18T10:10:00Z',
          race: 3,
          horse: 1,
          odds: 2.5,
          stake: 100,
          result: 'win',
          payout: 250,
          balance: 1150,
          strategy: 'conservative'
        }
      ];

      // Mock Logger.loadAllHistoricalLogs to return our test data
      jest.spyOn(Logger, 'loadAllHistoricalLogs').mockReturnValue(mockLogs);

      const report = Analyzer.analyzeHistoricalData();

      expect(report.totalBets).toBe(3);
      expect(report.totalWins).toBe(2);
      expect(report.overallWinRate).toBe((2 / 3) * 100);
      expect(report.totalProfit).toBe(50); // 1150 - 1100 (starting balance is first log's balance)
    });

    it('should identify hot horses', () => {
      const mockLogs: LogEntry[] = [
        { timestamp: '2026-08-18T10:00:00Z', race: 1, horse: 1, odds: 2.0, stake: 100, result: 'win', payout: 200, balance: 1100, strategy: 'conservative' },
        { timestamp: '2026-08-18T10:05:00Z', race: 2, horse: 1, odds: 2.0, stake: 100, result: 'win', payout: 200, balance: 1200, strategy: 'conservative' },
        { timestamp: '2026-08-18T10:10:00Z', race: 3, horse: 1, odds: 2.0, stake: 100, result: 'win', payout: 200, balance: 1300, strategy: 'conservative' }
      ];

      jest.spyOn(Logger, 'loadAllHistoricalLogs').mockReturnValue(mockLogs);

      const report = Analyzer.analyzeHistoricalData();

      expect(report.hotHorses).toHaveLength(1);
      expect(report.hotHorses[0].horse).toBe(1);
      expect(report.hotHorses[0].winRate).toBe(100);
    });

    it('should identify cold horses', () => {
      const mockLogs: LogEntry[] = [
        { timestamp: '2026-08-18T10:00:00Z', race: 1, horse: 3, odds: 5.0, stake: 100, result: 'loss', payout: 0, balance: 900, strategy: 'conservative' },
        { timestamp: '2026-08-18T10:05:00Z', race: 2, horse: 3, odds: 5.0, stake: 100, result: 'loss', payout: 0, balance: 800, strategy: 'conservative' },
        { timestamp: '2026-08-18T10:10:00Z', race: 3, horse: 3, odds: 5.0, stake: 100, result: 'loss', payout: 0, balance: 700, strategy: 'conservative' },
        { timestamp: '2026-08-18T10:15:00Z', race: 4, horse: 3, odds: 5.0, stake: 100, result: 'loss', payout: 0, balance: 600, strategy: 'conservative' },
        { timestamp: '2026-08-18T10:20:00Z', race: 5, horse: 3, odds: 5.0, stake: 100, result: 'loss', payout: 0, balance: 500, strategy: 'conservative' }
      ];

      jest.spyOn(Logger, 'loadAllHistoricalLogs').mockReturnValue(mockLogs);

      const report = Analyzer.analyzeHistoricalData();

      expect(report.coldHorses.length).toBeGreaterThan(0);
      expect(report.coldHorses[0].horse).toBe(3);
      expect(report.coldHorses[0].winRate).toBe(0);
    });

    it('should analyze odds ranges', () => {
      const mockLogs: LogEntry[] = [
        { timestamp: '2026-08-18T10:00:00Z', race: 1, horse: 1, odds: 1.5, stake: 100, result: 'win', payout: 150, balance: 1050, strategy: 'conservative' },
        { timestamp: '2026-08-18T10:05:00Z', race: 2, horse: 2, odds: 2.0, stake: 100, result: 'win', payout: 200, balance: 1150, strategy: 'conservative' },
        { timestamp: '2026-08-18T10:10:00Z', race: 3, horse: 3, odds: 5.0, stake: 100, result: 'loss', payout: 0, balance: 1050, strategy: 'conservative' },
        { timestamp: '2026-08-18T10:15:00Z', race: 4, horse: 4, odds: 10.0, stake: 100, result: 'loss', payout: 0, balance: 950, strategy: 'conservative' }
      ];

      jest.spyOn(Logger, 'loadAllHistoricalLogs').mockReturnValue(mockLogs);

      const report = Analyzer.analyzeHistoricalData();

      expect(report.oddsRangeStats.length).toBeGreaterThan(0);
      expect(report.bestOddsRange).toBeDefined();
    });

    it('should generate recommendations', () => {
      const mockLogs: LogEntry[] = [
        { timestamp: '2026-08-18T10:00:00Z', race: 1, horse: 1, odds: 2.0, stake: 100, result: 'win', payout: 200, balance: 1100, strategy: 'conservative' },
        { timestamp: '2026-08-18T10:05:00Z', race: 2, horse: 1, odds: 2.0, stake: 100, result: 'win', payout: 200, balance: 1200, strategy: 'conservative' }
      ];

      jest.spyOn(Logger, 'loadAllHistoricalLogs').mockReturnValue(mockLogs);

      const report = Analyzer.analyzeHistoricalData();

      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations[0]).toContain('Horse');
    });

    it('should calculate horse ROI correctly', () => {
      const mockLogs: LogEntry[] = [
        { timestamp: '2026-08-18T10:00:00Z', race: 1, horse: 1, odds: 2.0, stake: 100, result: 'win', payout: 200, balance: 1100, strategy: 'conservative' },
        { timestamp: '2026-08-18T10:05:00Z', race: 2, horse: 1, odds: 2.5, stake: 100, result: 'win', payout: 250, balance: 1250, strategy: 'conservative' }
      ];

      jest.spyOn(Logger, 'loadAllHistoricalLogs').mockReturnValue(mockLogs);

      const report = Analyzer.analyzeHistoricalData();

      expect(report.horseStats[0].roi).toBeGreaterThan(0);
    });
  });
});
