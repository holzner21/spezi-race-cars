import { chooseAutoStrategy, shouldContinueAutoBetting } from '../src/auto-betting';
import { HorseStats } from '../src/analyzer';
import { AutoBettingConfig, RaceOdds, SessionConfig, Stats, StrategyConfig } from '../src/types';

describe('auto betting helpers', () => {
  const strategyConfig: StrategyConfig = {
    minOddsThreshold: 1.5,
    maxOddsThreshold: 10,
    stakePercentage: 10,
    strategy: 'conservative'
  };

  const odds: RaceOdds = {
    win: {
      '1': 1.6,
      '2': 2.4,
      '3': 6.5
    },
    place: {},
    exacta: {},
    trifecta: {}
  };

  const historicalStats: HorseStats[] = [
    {
      horse: 1,
      totalBets: 40,
      wins: 28,
      losses: 12,
      winRate: 70,
      avgOdds: 1.6,
      avgPayout: 150,
      roi: 20
    },
    {
      horse: 3,
      totalBets: 10,
      wins: 3,
      losses: 7,
      winRate: 30,
      avgOdds: 6.5,
      avgPayout: 0,
      roi: -40
    }
  ];

  const makeBet = (result: 'win' | 'loss') => ({
    raceId: 1,
    horsePicked: result === 'win' ? 1 : 3,
    stakeAmount: 100,
    betType: 'win' as const,
    odds: result === 'win' ? 1.6 : 6.5,
    result,
    payout: result === 'win' ? 160 : 0,
    finishOrder: result === 'win' ? [1, 2, 3] : [2, 1, 3],
    newBalance: result === 'win' ? 1060 : 900
  });

  const baseAutoConfig: AutoBettingConfig = {
    enabled: true,
    indefinite: false,
    strategySwitchDelta: 5,
    recentWindowSize: 5
  };

  const makeLiveStats = (bets: Stats['bets'], currentBalance: number): Stats => ({
    totalRaces: bets.length,
    totalWins: bets.filter(bet => bet.result === 'win').length,
    totalLosses: bets.filter(bet => bet.result === 'loss').length,
    totalStaked: bets.reduce((sum, bet) => sum + bet.stakeAmount, 0),
    totalPayout: bets.reduce((sum, bet) => sum + bet.payout, 0),
    netProfit: currentBalance - 1000,
    roi: ((currentBalance - 1000) / 1000) * 100,
    startingBalance: 1000,
    currentBalance,
    bets
  });

  it('should continue forever when auto mode is indefinite', () => {
    expect(shouldContinueAutoBetting(999, 10, { ...baseAutoConfig, indefinite: true })).toBe(true);
  });

  it('should stop at the configured max race count when finite', () => {
    expect(shouldContinueAutoBetting(9, 10, baseAutoConfig)).toBe(true);
    expect(shouldContinueAutoBetting(10, 10, baseAutoConfig)).toBe(false);
  });

  it('should favor conservative strategy after a losing run', () => {
    const choice = chooseAutoStrategy(
      odds,
      900,
      strategyConfig,
      historicalStats,
      makeLiveStats([makeBet('loss'), makeBet('loss')], 900),
      'greedy',
      baseAutoConfig
    );

    expect(choice).not.toBeNull();
    expect(choice!.strategy).toBe('conservative');
    expect(choice!.switched).toBe(true);
  });

  it('should favor aggressive strategy when balance and streak are improving', () => {
    const choice = chooseAutoStrategy(
      odds,
      1160,
      strategyConfig,
      historicalStats,
      makeLiveStats([makeBet('win'), makeBet('win')], 1160),
      'conservative',
      baseAutoConfig
    );

    expect(choice).not.toBeNull();
    expect(choice!.strategy).toBe('kelly');
    expect(choice!.switched).toBe(true);
  });

  it('should hold the active strategy when the score delta is too small', () => {
    const choice = chooseAutoStrategy(
      odds,
      1000,
      strategyConfig,
      historicalStats,
      makeLiveStats([], 1000),
      'conservative',
      { ...baseAutoConfig, strategySwitchDelta: 10_000 }
    );

    expect(choice).not.toBeNull();
    expect(choice!.strategy).toBe('conservative');
    expect(choice!.switched).toBe(false);
  });
});