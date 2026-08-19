import { HorseStats } from './analyzer';
import { Stats, StrategyConfig, RaceOdds, AutoBettingConfig } from './types';
import { BetDecision, BettingStrategy } from './strategies';

export interface AutoStrategyChoice {
  strategy: StrategyConfig['strategy'];
  decision: BetDecision;
  score: number;
  switched: boolean;
  reason: string;
}

const AUTO_STRATEGIES: StrategyConfig['strategy'][] = ['greedy', 'kelly', 'conservative', 'adaptive'];

export function shouldContinueAutoBetting(
  raceCount: number,
  maxRaces: number,
  autoBetting?: AutoBettingConfig
): boolean {
  if (autoBetting?.indefinite) {
    return true;
  }

  return raceCount < maxRaces;
}

export function chooseAutoStrategy(
  odds: RaceOdds,
  balance: number,
  strategyConfig: StrategyConfig,
  historicalStats: HorseStats[],
  liveStats: Stats,
  activeStrategy: StrategyConfig['strategy'],
  autoConfig: AutoBettingConfig
): AutoStrategyChoice | null {
  const candidates = AUTO_STRATEGIES.flatMap(strategy => {
    const decision = BettingStrategy.decideBet(
      odds,
      balance,
      { ...strategyConfig, strategy },
      historicalStats
    );

    if (!decision) {
      return [];
    }

    return [{
      strategy,
      decision,
      score: scoreStrategyDecision(decision, strategy, liveStats, historicalStats, autoConfig),
      reason: buildReason(decision, strategy, liveStats)
    }];
  });

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0];
  const current = candidates.find(candidate => candidate.strategy === activeStrategy);

  if (current && best.strategy !== activeStrategy) {
    const scoreDelta = best.score - current.score;
    if (scoreDelta < autoConfig.strategySwitchDelta) {
      return {
        ...current,
        switched: false,
        reason: `${current.reason} | Holding current strategy (score delta ${scoreDelta.toFixed(2)})`
      };
    }
  }

  return {
    ...best,
    switched: best.strategy !== activeStrategy,
    reason: best.strategy === activeStrategy
      ? `${best.reason} | Holding current strategy`
      : `${best.reason} | Switching from ${activeStrategy} to ${best.strategy}`
  };
}

function scoreStrategyDecision(
  decision: BetDecision,
  strategy: StrategyConfig['strategy'],
  liveStats: Stats,
  historicalStats: HorseStats[],
  autoConfig: AutoBettingConfig
): number {
  const recentBets = liveStats.bets.slice(-Math.max(1, autoConfig.recentWindowSize));
  const recentWins = recentBets.filter(bet => bet.result === 'win').length;
  const recentWinRate = recentBets.length > 0 ? (recentWins / recentBets.length) * 100 : 0;
  const recentLossStreak = getRecentStreak(recentBets, 'loss');
  const recentWinStreak = getRecentStreak(recentBets, 'win');
  const horseHistory = historicalStats.find(stat => stat.horse === decision.horse);

  let score = decision.expectedValue * 120 + decision.probability * 25;

  if (horseHistory) {
    score += horseHistory.winRate / 10;
  }

  if (decision.reason.includes('[Historical]')) {
    score += 2;
  }

  if (liveStats.roi < -10 || liveStats.netProfit < 0) {
    if (strategy === 'conservative') score += 18;
    if (strategy === 'adaptive') score += 14;
    if (strategy === 'kelly') score += 5;
    if (strategy === 'greedy') score -= 8;
  }

  if (recentLossStreak >= 2) {
    if (strategy === 'conservative') score += 15;
    if (strategy === 'adaptive') score += 12;
    if (strategy === 'kelly') score += 4;
    if (strategy === 'greedy') score -= 10;
  }

  if (liveStats.roi > 10 || recentWinRate >= 65 || recentWinStreak >= 2) {
    if (strategy === 'greedy') score += 10;
    if (strategy === 'kelly') score += 12;
    if (strategy === 'adaptive') score += 9;
    if (strategy === 'conservative') score -= 2;
  }

  if (decision.odds <= 2.5) {
    if (strategy === 'conservative') score += 6;
    if (strategy === 'kelly') score += 3;
  }

  if (decision.odds >= 5) {
    if (strategy === 'greedy') score += 8;
    if (strategy === 'kelly') score += 4;
    if (strategy === 'adaptive') score += 2;
    if (strategy === 'conservative') score -= 3;
  }

  return score;
}

function buildReason(
  decision: BetDecision,
  strategy: StrategyConfig['strategy'],
  liveStats: Stats
): string {
  const liveContext = liveStats.totalRaces > 0
    ? `Live ROI: ${liveStats.roi.toFixed(2)}%, Win rate: ${((liveStats.totalWins / liveStats.totalRaces) * 100).toFixed(2)}%`
    : 'Live ROI: 0.00%, Win rate: 0.00%';

  return `${decision.reason} | Strategy: ${strategy} | ${liveContext}`;
}

function getRecentStreak(bets: Stats['bets'], result: 'win' | 'loss'): number {
  let streak = 0;

  for (let index = bets.length - 1; index >= 0; index--) {
    if (bets[index].result !== result) {
      break;
    }

    streak++;
  }

  return streak;
}