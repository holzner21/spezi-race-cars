import chalk from 'chalk';
import { Logger, RaceRecord } from './logger';
import { BettingStrategy } from './strategies';
import { StrategyConfig } from './types';

// ---------------------------------------------------------------------------
// Simulation result types
// ---------------------------------------------------------------------------

export interface SimulatedBet {
  raceId: number;
  horsePicked: number;
  stake: number;
  oddsAtBet: number;
  actualFinishOrder: number[];
  won: boolean;
  payout: number;
  balanceBefore: number;
  balanceAfter: number;
}

export interface SimulationResult {
  strategy: string;
  totalRaces: number;
  betsPlaced: number;
  wins: number;
  losses: number;
  skipped: number;
  winRate: number;
  totalStaked: number;
  totalPayout: number;
  netProfit: number;
  roi: number;
  startingBalance: number;
  finalBalance: number;
  maxDrawdown: number;
  peakBalance: number;
  bets: SimulatedBet[];
}

export interface StrategyComparison {
  strategies: SimulationResult[];
  bestByROI: string;
  bestByWinRate: string;
  bestByFinalBalance: string;
  summary: string[];
}

// ---------------------------------------------------------------------------
// Simulator
// ---------------------------------------------------------------------------

export class Simulator {
  /**
   * Replay a single strategy configuration against all stored historical races.
   *
   * The simulator:
   *  - loads every race record that has full odds data
   *  - applies `strategyConfig` to the stored odds to decide whether/what to bet
   *  - uses the stored `finishOrder` as ground truth to determine win/loss
   *  - tracks balance, drawdown, and all per-bet stats
   *
   * @param strategyConfig  Strategy and odds thresholds to test
   * @param initialBalance  Starting balance for the simulation
   */
  static run(
    strategyConfig: StrategyConfig,
    initialBalance = 1000
  ): SimulationResult {
    const records = Logger.loadAllRaceRecords().filter(r => hasFullOdds(r));

    return Simulator.simulate(records, strategyConfig, initialBalance);
  }

  /**
   * Compare multiple strategy configurations side-by-side.
   */
  static compare(
    strategies: StrategyConfig[],
    initialBalance = 1000
  ): StrategyComparison {
    const records = Logger.loadAllRaceRecords().filter(r => hasFullOdds(r));

    const results = strategies.map(cfg => Simulator.simulate(records, cfg, initialBalance));

    const bestByROI = results.reduce((a, b) => (b.roi > a.roi ? b : a)).strategy;
    const bestByWinRate = results.reduce((a, b) => (b.winRate > a.winRate ? b : a)).strategy;
    const bestByFinalBalance = results.reduce((a, b) =>
      b.finalBalance > a.finalBalance ? b : a
    ).strategy;

    const summary: string[] = [
      `Simulated ${records.length} historical races`,
      `Best ROI: ${bestByROI}`,
      `Best win-rate: ${bestByWinRate}`,
      `Best final balance: ${bestByFinalBalance}`
    ];

    return { strategies: results, bestByROI, bestByWinRate, bestByFinalBalance, summary };
  }

  /**
   * Print a SimulationResult to the console.
   */
  static printResult(result: SimulationResult): void {
    console.log(chalk.cyan(`\n📊 Simulation — strategy: ${result.strategy}`));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`  Races available  : ${result.totalRaces}`);
    console.log(`  Bets placed      : ${result.betsPlaced}  (skipped: ${result.skipped})`);
    console.log(`  Wins / Losses    : ${result.wins} / ${result.losses}`);
    console.log(`  Win rate         : ${result.winRate.toFixed(2)}%`);
    console.log(`  Total staked     : ${result.totalStaked.toFixed(2)}`);
    console.log(`  Total payout     : ${result.totalPayout.toFixed(2)}`);
    const profitColor = result.netProfit >= 0 ? chalk.green : chalk.red;
    console.log(`  Net profit       : ${profitColor(result.netProfit.toFixed(2))}`);
    console.log(`  ROI              : ${profitColor(result.roi.toFixed(2) + '%')}`);
    console.log(`  Starting balance : ${result.startingBalance}`);
    console.log(`  Final balance    : ${result.finalBalance.toFixed(2)}`);
    console.log(`  Peak balance     : ${result.peakBalance.toFixed(2)}`);
    console.log(`  Max drawdown     : ${chalk.red(result.maxDrawdown.toFixed(2))}`);
    console.log();
  }

  /**
   * Print a multi-strategy comparison.
   */
  static printComparison(comparison: StrategyComparison): void {
    console.log(chalk.cyan('\n📊 Strategy Comparison'));
    console.log(chalk.gray('─'.repeat(50)));
    for (const line of comparison.summary) {
      console.log(`  ${line}`);
    }
    console.log();
    for (const r of comparison.strategies) {
      Simulator.printResult(r);
    }
  }

  // ---------------------------------------------------------------------------
  // Core simulation engine
  // ---------------------------------------------------------------------------

  private static simulate(
    records: RaceRecord[],
    strategyConfig: StrategyConfig,
    initialBalance: number
  ): SimulationResult {
    let balance = initialBalance;
    let peakBalance = initialBalance;
    let maxDrawdown = 0;
    let wins = 0;
    let losses = 0;
    let skipped = 0;
    let totalStaked = 0;
    let totalPayout = 0;
    const bets: SimulatedBet[] = [];

    const strategyLabel = `${strategyConfig.strategy}[min=${strategyConfig.minOddsThreshold},max=${strategyConfig.maxOddsThreshold},stake=${strategyConfig.stakePercentage}%]`;

    for (const race of records) {
      const odds = {
        win: race.winOdds,
        place: race.placeOdds,
        exacta: race.exactaOdds,
        trifecta: race.trifectaOdds
      };

      const decision = BettingStrategy.decideBet(odds, balance, strategyConfig);

      if (!decision) {
        skipped++;
        continue;
      }

      const winner = race.finishOrder[0];
      const won = decision.horse === winner;
      const payout = won ? Math.round(decision.stake * decision.odds) : 0;
      const balanceBefore = balance;
      balance = balance - decision.stake + payout;

      if (balance > peakBalance) peakBalance = balance;
      const drawdown = peakBalance - balance;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;

      if (won) wins++; else losses++;
      totalStaked += decision.stake;
      totalPayout += payout;

      bets.push({
        raceId: race.raceId,
        horsePicked: decision.horse,
        stake: decision.stake,
        oddsAtBet: decision.odds,
        actualFinishOrder: race.finishOrder,
        won,
        payout,
        balanceBefore,
        balanceAfter: balance
      });
    }

    const betsPlaced = wins + losses;
    const winRate = betsPlaced > 0 ? (wins / betsPlaced) * 100 : 0;
    const netProfit = balance - initialBalance;
    const roi = totalStaked > 0 ? (netProfit / totalStaked) * 100 : 0;

    return {
      strategy: strategyLabel,
      totalRaces: records.length,
      betsPlaced,
      wins,
      losses,
      skipped,
      winRate,
      totalStaked,
      totalPayout,
      netProfit,
      roi,
      startingBalance: initialBalance,
      finalBalance: balance,
      maxDrawdown,
      peakBalance,
      bets
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasFullOdds(r: RaceRecord): boolean {
  return Object.keys(r.winOdds).length > 0;
}
