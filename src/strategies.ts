import { RaceOdds, StrategyConfig } from './types';
import { HorseStats } from './analyzer';

export interface BetDecision {
  horse: number;
  stake: number;
  odds: number;
  expectedValue: number;
  probability: number;
  reason: string;
}

export class BettingStrategy {
  /**
   * Calculate implied probability from odds
   * Probability = 1 / odds
   */
  static getImpliedProbability(odds: number): number {
    return 1 / odds;
  }

  /**
   * Find the best bet based on strategy with optional historical data
   */
  static decideBet(
    odds: RaceOdds,
    balance: number,
    config: StrategyConfig,
    horseStats?: HorseStats[]
  ): BetDecision | null {
    const winOdds = odds.win;
    const candidates: BetDecision[] = [];

    for (const [horseStr, horseOdds] of Object.entries(winOdds)) {
      const horse = parseInt(horseStr);
      const probability = this.getImpliedProbability(horseOdds);
      const expectedValue = probability - (1 - probability) / horseOdds;

      // Filter by odds threshold
      if (horseOdds < config.minOddsThreshold || horseOdds > config.maxOddsThreshold) {
        continue;
      }

      // Get historical win rate if available
      const histStats = horseStats?.find(h => h.horse === horse);
      const historicalWinRate = histStats ? histStats.winRate / 100 : null;

      // Use historical data if available, otherwise use implied probability
      const adjustedProbability = historicalWinRate ?? probability;
      const adjustedEV = adjustedProbability - (1 - adjustedProbability) / horseOdds;

      candidates.push({
        horse,
        stake: 0,
        odds: horseOdds,
        expectedValue: adjustedEV,
        probability: adjustedProbability,
        reason: `Probability: ${(adjustedProbability * 100).toFixed(2)}%, EV: ${adjustedEV.toFixed(4)}${historicalWinRate ? ' [Historical]' : ''}`
      });
    }

    if (candidates.length === 0) {
      return null;
    }

    if (config.strategy === 'kelly') {
      const positiveEdgeCandidates = candidates.filter(candidate => candidate.expectedValue > 0);
      if (positiveEdgeCandidates.length > 0) {
        candidates.splice(0, candidates.length, ...positiveEdgeCandidates);
      }
    }

    // Sort by different strategies
    switch (config.strategy) {
      case 'greedy':
        // Pick best odds (highest potential payout)
        candidates.sort((a, b) => b.odds - a.odds);
        break;

      case 'kelly':
        // Prefer the horse with the strongest positive edge, not just the largest raw odds.
        // Combine expected value and Kelly fraction using the actual win probability.
        candidates.sort((a, b) => {
          const aKelly = this.kellyFraction(a.odds, a.probability);
          const bKelly = this.kellyFraction(b.odds, b.probability);
          const aScore = a.expectedValue + aKelly;
          const bScore = b.expectedValue + bKelly;
          return bScore - aScore;
        });
        break;

      case 'conservative':
      default:
        // Pick favorites with best odds
        candidates.sort((a, b) => a.odds - b.odds);
        break;
    }

    const best = candidates[0];
    const stake = balance * (config.stakePercentage / 100);
    best.stake = Math.max(Math.floor(stake), 1); // Minimum stake of 1

    return best;
  }

  /**
   * Kelly Criterion: f* = (p * b - q) / b
   * where p = win probability, q = loss probability, b = odds - 1
   */
  private static kellyFraction(odds: number, probability: number): number {
    const b = odds - 1;
    const q = 1 - probability;
    const fraction = (probability * b - q) / b;
    return Math.max(0, Math.min(fraction, 0.25)); // Cap at 25% to be conservative
  }

  /**
   * Calculate expected value of a bet
   */
  static calculateExpectedValue(stake: number, odds: number, probability: number): number {
    const win = stake * odds * probability;
    const loss = -stake * (1 - probability);
    return win + loss;
  }
}
