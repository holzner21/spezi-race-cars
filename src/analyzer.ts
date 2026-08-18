import { Logger, LogEntry } from './logger';

export interface HorseStats {
  horse: number;
  totalBets: number;
  wins: number;
  losses: number;
  winRate: number;
  avgOdds: number;
  avgPayout: number;
  roi: number; // Return on investment
}

export interface OddsRangeStats {
  minOdds: number;
  maxOdds: number;
  totalBets: number;
  wins: number;
  winRate: number;
  avgPayout: number;
}

export interface AnalysisReport {
  totalBets: number;
  totalWins: number;
  overallWinRate: number;
  totalProfit: number;
  horseStats: HorseStats[];
  oddsRangeStats: OddsRangeStats[];
  hotHorses: HorseStats[]; // Horses with >50% win rate
  coldHorses: HorseStats[]; // Horses with <20% win rate
  bestOddsRange: OddsRangeStats | null;
  recommendations: string[];
}

export class Analyzer {
  static analyzeHistoricalData(): AnalysisReport {
    const allLogs = Logger.loadAllHistoricalLogs();

    if (allLogs.length === 0) {
      return this.getEmptyReport();
    }

    // Horse statistics
    const horseMap = new Map<number, HorseStats>();
    let totalWins = 0;
    let totalProfit = 0;
    let startBalance = 0;
    let endBalance = 0;

    for (const log of allLogs) {
      const horse = log.horse;
      if (!horseMap.has(horse)) {
        horseMap.set(horse, {
          horse,
          totalBets: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          avgOdds: 0,
          avgPayout: 0,
          roi: 0
        });
      }

      const stats = horseMap.get(horse)!;
      stats.totalBets++;
      if (log.result === 'win') {
        stats.wins++;
        totalWins++;
      } else {
        stats.losses++;
      }

      stats.avgOdds = (stats.avgOdds * (stats.totalBets - 1) + log.odds) / stats.totalBets;
      stats.avgPayout = (stats.avgPayout * (stats.totalBets - 1) + log.payout) / stats.totalBets;

      if (!startBalance) startBalance = log.balance;
      endBalance = log.balance;
    }

    totalProfit = endBalance - startBalance;

    // Calculate derived metrics
    const horseStats = Array.from(horseMap.values()).map(h => ({
      ...h,
      winRate: (h.wins / h.totalBets) * 100,
      roi: ((h.wins * h.avgPayout - h.totalBets) / h.totalBets) * 100
    }));

    // Odds range statistics
    const oddsRanges = this.generateOddsRanges(allLogs);

    // Find patterns
    const hotHorses = horseStats.filter(h => h.winRate > 50).sort((a, b) => b.winRate - a.winRate);
    const coldHorses = horseStats.filter(h => h.winRate < 20).sort((a, b) => a.winRate - b.winRate);
    const bestOddsRange = oddsRanges.reduce((best, current) =>
      current.winRate > (best?.winRate || 0) ? current : best
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      horseStats,
      oddsRanges,
      totalWins,
      allLogs.length,
      totalProfit
    );

    return {
      totalBets: allLogs.length,
      totalWins,
      overallWinRate: (totalWins / allLogs.length) * 100,
      totalProfit,
      horseStats: horseStats.sort((a, b) => b.totalBets - a.totalBets),
      oddsRangeStats: oddsRanges,
      hotHorses,
      coldHorses,
      bestOddsRange: bestOddsRange || null,
      recommendations
    };
  }

  private static generateOddsRanges(logs: LogEntry[]): OddsRangeStats[] {
    const ranges: OddsRangeStats[] = [
      { minOdds: 1.0, maxOdds: 1.5, totalBets: 0, wins: 0, winRate: 0, avgPayout: 0 },
      { minOdds: 1.5, maxOdds: 2.5, totalBets: 0, wins: 0, winRate: 0, avgPayout: 0 },
      { minOdds: 2.5, maxOdds: 5.0, totalBets: 0, wins: 0, winRate: 0, avgPayout: 0 },
      { minOdds: 5.0, maxOdds: 10.0, totalBets: 0, wins: 0, winRate: 0, avgPayout: 0 },
      { minOdds: 10.0, maxOdds: 100.0, totalBets: 0, wins: 0, winRate: 0, avgPayout: 0 }
    ];

    for (const log of logs) {
      const range = ranges.find(r => log.odds >= r.minOdds && log.odds < r.maxOdds);
      if (range) {
        range.totalBets++;
        if (log.result === 'win') {
          range.wins++;
        }
        range.avgPayout = (range.avgPayout * (range.totalBets - 1) + log.payout) / range.totalBets;
      }
    }

    return ranges.map(r => ({
      ...r,
      winRate: r.totalBets > 0 ? (r.wins / r.totalBets) * 100 : 0
    }));
  }

  private static generateRecommendations(
    horseStats: HorseStats[],
    oddsRanges: OddsRangeStats[],
    totalWins: number,
    totalBets: number,
    totalProfit: number
  ): string[] {
    const recommendations: string[] = [];

    // Horse recommendations
    const bestHorse = horseStats[0];
    if (bestHorse && bestHorse.winRate > 40) {
      recommendations.push(`🐴 Horse ${bestHorse.horse} has ${bestHorse.winRate.toFixed(1)}% win rate - consider betting more on it`);
    }

    const worstHorse = horseStats[horseStats.length - 1];
    if (worstHorse && worstHorse.winRate < 30) {
      recommendations.push(`❌ Avoid Horse ${worstHorse.horse} - only ${worstHorse.winRate.toFixed(1)}% win rate`);
    }

    // Odds recommendations
    const bestOddsRange = oddsRanges.reduce((best, current) =>
      current.winRate > best.winRate ? current : best
    );
    recommendations.push(`📊 Best odds range: ${bestOddsRange.minOdds}-${bestOddsRange.maxOdds} (${bestOddsRange.winRate.toFixed(1)}% win rate)`);

    // Overall performance
    const roi = ((totalProfit / (totalBets * 10)) * 100).toFixed(1); // Assuming avg 10 stake
    if (totalProfit > 0) {
      recommendations.push(`✅ Overall profitable! ROI: ${roi}% - keep current strategy`);
    } else if (totalProfit < -totalBets * 5) {
      recommendations.push(`⚠️  Significant losses detected. Consider switching strategy or reducing stake%`);
    }

    // Win rate
    const winRate = (totalWins / totalBets) * 100;
    if (winRate < 25) {
      recommendations.push(`📉 Win rate ${winRate.toFixed(1)}% is low - adjust odds thresholds or strategy`);
    }

    return recommendations;
  }

  private static getEmptyReport(): AnalysisReport {
    return {
      totalBets: 0,
      totalWins: 0,
      overallWinRate: 0,
      totalProfit: 0,
      horseStats: [],
      oddsRangeStats: [],
      hotHorses: [],
      coldHorses: [],
      bestOddsRange: null,
      recommendations: ['No historical data yet. Start betting to gather data for analysis!']
    };
  }

  static printReport(report: AnalysisReport): void {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║           HISTORICAL BETTING ANALYSIS                  ║');
    console.log('╠════════════════════════════════════════════════════════╣');
    console.log(`║ Total Bets:              ${report.totalBets.toString().padEnd(36)} ║`);
    console.log(`║ Total Wins:              ${report.totalWins.toString().padEnd(36)} ║`);
    console.log(`║ Overall Win Rate:        ${report.overallWinRate.toFixed(2)}%${' '.repeat(31)} ║`);
    console.log(`║ Total Profit:            ${report.totalProfit.toString().padEnd(36)} ║`);
    console.log('╠════════════════════════════════════════════════════════╣');

    if (report.hotHorses.length > 0) {
      console.log('║ 🔥 HOT HORSES (>50% win rate):                         ║');
      for (const horse of report.hotHorses) {
        console.log(
          `║   Horse ${horse.horse}: ${horse.winRate.toFixed(1)}% (${horse.wins}/${horse.totalBets})${' '.repeat(31 - horse.horse.toString().length - horse.winRate.toFixed(1).length - horse.wins.toString().length - horse.totalBets.toString().length)} ║`
        );
      }
    }

    if (report.coldHorses.length > 0) {
      console.log('║ ❄️  COLD HORSES (<20% win rate):                       ║');
      for (const horse of report.coldHorses) {
        console.log(
          `║   Horse ${horse.horse}: ${horse.winRate.toFixed(1)}% (${horse.wins}/${horse.totalBets})${' '.repeat(31 - horse.horse.toString().length - horse.winRate.toFixed(1).length - horse.wins.toString().length - horse.totalBets.toString().length)} ║`
        );
      }
    }

    console.log('╠════════════════════════════════════════════════════════╣');
    console.log('║ 💡 RECOMMENDATIONS:                                    ║');
    for (const rec of report.recommendations) {
      const lines = this.wrapText(rec, 54);
      for (let i = 0; i < lines.length; i++) {
        console.log(`║ ${lines[i].padEnd(54)} ║`);
      }
    }

    console.log('╚════════════════════════════════════════════════════════╝\n');
  }

  private static wrapText(text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    let currentLine = '';

    const words = text.split(' ');
    for (const word of words) {
      if ((currentLine + word).length <= maxWidth) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) lines.push(currentLine);
    return lines;
  }
}
