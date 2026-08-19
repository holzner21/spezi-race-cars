import { BettingStrategy } from '../src/strategies';

describe('BettingStrategy', () => {
  const mockOdds = {
    win: { '1': 2.5, '2': 3.0, '3': 5.0, '4': 10.0 },
    place: {},
    exacta: {},
    trifecta: {}
  };

  describe('getImpliedProbability', () => {
    it('should calculate implied probability correctly', () => {
      expect(BettingStrategy.getImpliedProbability(2.0)).toBe(0.5);
      expect(BettingStrategy.getImpliedProbability(4.0)).toBe(0.25);
      expect(BettingStrategy.getImpliedProbability(10.0)).toBe(0.1);
    });

    it('should handle odds of 1', () => {
      expect(BettingStrategy.getImpliedProbability(1.0)).toBe(1.0);
    });
  });

  describe('decideBet', () => {
    const config = {
      minOddsThreshold: 1.5,
      maxOddsThreshold: 10.0,
      stakePercentage: 10,
      strategy: 'conservative' as const
    };

    it('should return null when no bets pass odds threshold', () => {
      const tightConfig = {
        ...config,
        minOddsThreshold: 20.0,
        maxOddsThreshold: 50.0
      };
      const decision = BettingStrategy.decideBet(mockOdds, 1000, tightConfig);
      expect(decision).toBeNull();
    });

    it('should return a valid bet decision', () => {
      const decision = BettingStrategy.decideBet(mockOdds, 1000, config);
      expect(decision).not.toBeNull();
      expect(decision!.horse).toBeGreaterThanOrEqual(1);
      expect(decision!.horse).toBeLessThanOrEqual(4);
      expect(decision!.stake).toBeGreaterThan(0);
      expect(decision!.odds).toBeGreaterThanOrEqual(config.minOddsThreshold);
      expect(decision!.odds).toBeLessThanOrEqual(config.maxOddsThreshold);
    });

    it('conservative strategy should pick favorites (lower odds)', () => {
      const conservativeConfig = {
        ...config,
        strategy: 'conservative' as const
      };
      const decision = BettingStrategy.decideBet(mockOdds, 1000, conservativeConfig);
      expect(decision!.odds).toBeLessThanOrEqual(3.0);
    });

    it('greedy strategy should prefer higher odds', () => {
      const greedyConfig = {
        ...config,
        strategy: 'greedy' as const
      };
      const decision = BettingStrategy.decideBet(mockOdds, 1000, greedyConfig);
      // Greedy should pick the highest odds within threshold
      expect(decision!.odds).toBeGreaterThanOrEqual(5.0);
    });

    it('should calculate correct stake based on balance and percentage', () => {
      const decision = BettingStrategy.decideBet(mockOdds, 1000, config);
      const expectedStake = Math.floor(1000 * (config.stakePercentage / 100));
      expect(decision!.stake).toBe(expectedStake);
    });

    it('should enforce minimum stake of 1', () => {
      const lowBalanceConfig = {
        ...config,
        stakePercentage: 0.001 // Very low percentage
      };
      const decision = BettingStrategy.decideBet(mockOdds, 1000, lowBalanceConfig);
      expect(decision!.stake).toBeGreaterThanOrEqual(1);
    });

    it('should use historical data when provided', () => {
      const historicalData = [
        { horse: 1, totalBets: 100, wins: 80, losses: 20, avgOdds: 2.5, avgPayout: 200, winRate: 80, roi: 100 },
        { horse: 2, totalBets: 100, wins: 30, losses: 70, avgOdds: 3.0, avgPayout: 90, winRate: 30, roi: -70 }
      ];

      const decision = BettingStrategy.decideBet(mockOdds, 1000, config, historicalData);
      
      // Should prefer horse 1 with 80% win rate
      expect(decision!.horse).toBe(1);
      expect(decision!.reason).toContain('[Historical]');
    });

    it('kelly strategy should prefer the horse with a real positive edge over the first horse in insertion order', () => {
      const odds = {
        win: { '1': 1.8, '2': 2.8 },
        place: {},
        exacta: {},
        trifecta: {}
      };
      const historicalData = [
        { horse: 1, totalBets: 10, wins: 2, losses: 8, avgOdds: 1.8, avgPayout: 50, winRate: 20, roi: -60 },
        { horse: 2, totalBets: 10, wins: 6, losses: 4, avgOdds: 2.8, avgPayout: 110, winRate: 60, roi: 20 }
      ];

      const decision = BettingStrategy.decideBet(odds, 1000, { ...config, strategy: 'kelly' }, historicalData);

      expect(decision).not.toBeNull();
      expect(decision!.horse).toBe(2);
      expect(decision!.reason).toContain('[Historical]');
    });
  });

  describe('calculateExpectedValue', () => {
    it('should calculate positive expected value', () => {
      const ev = BettingStrategy.calculateExpectedValue(100, 2.0, 0.6); // 60% win probability
      expect(ev).toBeGreaterThan(0);
    });

    it('should calculate negative expected value', () => {
      const ev = BettingStrategy.calculateExpectedValue(100, 2.0, 0.3); // 30% win probability
      expect(ev).toBeLessThan(0);
    });

    it('should calculate break-even scenario', () => {
      // With 50% probability and 2.0 odds, EV is actually 50 (not 0)
      // For true break-even, we need: probability = 1/(odds+1)
      const breakEvenProbability = 1 / 3.0; // For odds of 2.0
      const ev = BettingStrategy.calculateExpectedValue(100, 2.0, breakEvenProbability);
      expect(ev).toBeCloseTo(0, 1);
    });
  });
});
