import { BetResult, Stats } from './types';

export class StatsTracker {
  private stats: Stats;

  constructor(startingBalance: number) {
    this.stats = {
      totalRaces: 0,
      totalWins: 0,
      totalLosses: 0,
      totalStaked: 0,
      totalPayout: 0,
      netProfit: 0,
      roi: 0,
      startingBalance,
      currentBalance: startingBalance,
      bets: []
    };
  }

  recordBet(bet: BetResult): void {
    this.stats.totalRaces++;

    if (bet.result === 'win') {
      this.stats.totalWins++;
    } else {
      this.stats.totalLosses++;
    }

    this.stats.totalStaked += bet.stakeAmount;
    this.stats.totalPayout += bet.payout;
    this.stats.currentBalance = bet.newBalance;
    this.stats.netProfit = this.stats.currentBalance - this.stats.startingBalance;
    this.stats.roi = (this.stats.netProfit / this.stats.startingBalance) * 100;

    this.stats.bets.push(bet);
  }

  getStats(): Stats {
    return { ...this.stats };
  }

  getWinRate(): number {
    if (this.stats.totalRaces === 0) return 0;
    return (this.stats.totalWins / this.stats.totalRaces) * 100;
  }

  getAveragePayout(): number {
    if (this.stats.totalWins === 0) return 0;
    return this.stats.totalPayout / this.stats.totalWins;
  }

  getAverageStake(): number {
    if (this.stats.totalRaces === 0) return 0;
    return this.stats.totalStaked / this.stats.totalRaces;
  }

  printSummary(): void {
    const stats = this.stats;
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║        BETTING SESSION SUMMARY         ║');
    console.log('╠════════════════════════════════════════╣');
    console.log(`║ Total Races:         ${stats.totalRaces.toString().padEnd(22)} ║`);
    console.log(`║ Wins:                ${stats.totalWins.toString().padEnd(22)} ║`);
    console.log(`║ Losses:              ${stats.totalLosses.toString().padEnd(22)} ║`);
    console.log(`║ Win Rate:            ${this.getWinRate().toFixed(2)}%${' '.repeat(18)} ║`);
    console.log('╠════════════════════════════════════════╣');
    console.log(`║ Starting Balance:    ${stats.startingBalance.toString().padEnd(22)} ║`);
    console.log(`║ Current Balance:     ${stats.currentBalance.toString().padEnd(22)} ║`);
    console.log(`║ Total Staked:        ${stats.totalStaked.toString().padEnd(22)} ║`);
    console.log(`║ Total Payout:        ${stats.totalPayout.toString().padEnd(22)} ║`);
    console.log('╠════════════════════════════════════════╣');
    console.log(`║ Net Profit/Loss:     ${stats.netProfit.toString().padEnd(22)} ║`);
    console.log(`║ ROI:                 ${stats.roi.toFixed(2)}%${' '.repeat(18)} ║`);
    console.log('╚════════════════════════════════════════╝\n');
  }
}
