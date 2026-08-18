import chalk from 'chalk';
import { ApiClient, ThrottledError } from './api-client';
import { BettingStrategy } from './strategies';
import { StatsTracker } from './stats-tracker';
import { Logger } from './logger';
import { Analyzer } from './analyzer';
import { BetResult, SessionConfig, StrategyConfig } from './types';

export class BettingBot {
  private apiClient: ApiClient;
  private statsTracker: StatsTracker;
  private logger: Logger;
  private sessionConfig: SessionConfig;
  private raceCount = 0;

  constructor(sessionConfig: SessionConfig, startingBalance: number) {
    this.sessionConfig = sessionConfig;
    this.apiClient = new ApiClient(sessionConfig.cookies);
    this.statsTracker = new StatsTracker(startingBalance);
    this.logger = new Logger();
  }

  async run(): Promise<void> {
    console.log(chalk.cyan('\n🏁 Vespa Race Betting Bot Started\n'));
    console.log(chalk.gray(`Strategy: ${this.sessionConfig.strategyConfig.strategy}`));
    console.log(chalk.gray(`Max Races: ${this.sessionConfig.maxRaces}`));
    console.log(chalk.gray(`Stake %: ${this.sessionConfig.strategyConfig.stakePercentage}%\n`));

    let currentRaceId = this.sessionConfig.raceId || 0;
    let currentBalance = 0;
    let currentOdds = null;

    try {
      // Initialize: fetch first race data
      if (this.raceCount === 0) {
        console.log(chalk.cyan('📋 Fetching initial race data...'));
        try {
          const initResult = await this.apiClient.placeBet({
            action: 'vespa_race_play',
            nonce: this.sessionConfig.nonce,
            race_id: currentRaceId,
            bet_type: 'win',
            picks: 1, // Dummy pick
            stake: 1 // Minimal stake just to get data
          });

          currentBalance = initResult.data.new_balance;
          currentRaceId = initResult.data.next_race.race_id;
          currentOdds = initResult.data.next_race.odds;

          console.log(chalk.green(`✓ Initialized. Current balance: ${currentBalance}\n`));
        } catch (error) {
          console.error(chalk.red(`Failed to initialize: ${error}`));
          return;
        }
      }

      // Load historical data for improved betting
      const historicalLogs = Logger.loadAllHistoricalLogs();
      const horseStats = this.analyzeHorses(historicalLogs);

      if (horseStats.length > 0) {
        console.log(chalk.yellow('📊 Using historical data to improve bets\n'));
      }

      // Start betting loop
      while (this.raceCount < this.sessionConfig.maxRaces) {
        // Decide bet based on strategy
        if (!currentOdds) {
          console.log(chalk.red('No odds data available'));
          break;
        }

        const betDecision = BettingStrategy.decideBet(
          currentOdds,
          currentBalance,
          this.sessionConfig.strategyConfig,
          horseStats.length > 0 ? horseStats : undefined
        );

        if (!betDecision) {
          console.log(chalk.yellow(`Race ${this.raceCount + 1}: No suitable bets found. Skipping.`));
          this.raceCount++;
          continue;
        }

        // Place bet with retry logic for throttling
        console.log(
          chalk.blue(
            `Race ${this.raceCount + 1}: Betting ${betDecision.stake} on Horse ${betDecision.horse} @ ${betDecision.odds.toFixed(4)}`
          )
        );
        console.log(chalk.gray(`  ${betDecision.reason}`));

        try {
          const result = await this.placeBetWithRetry({
            action: 'vespa_race_play',
            nonce: this.sessionConfig.nonce,
            race_id: currentRaceId,
            bet_type: 'win',
            picks: betDecision.horse,
            stake: betDecision.stake
          });

          // Process result
          const betResult: BetResult = {
            raceId: currentRaceId,
            horsePicked: betDecision.horse,
            stakeAmount: betDecision.stake,
            betType: 'win',
            odds: betDecision.odds,
            result: result.data.result as 'win' | 'loss',
            payout: result.data.payout,
            finishOrder: result.data.finish_order,
            newBalance: result.data.new_balance
          };

          this.statsTracker.recordBet(betResult);
          this.logger.logBet(betResult, this.sessionConfig.strategyConfig.strategy);
          currentBalance = result.data.new_balance;
          currentRaceId = result.data.next_race.race_id;
          currentOdds = result.data.next_race.odds;

          if (betResult.result === 'win') {
            console.log(chalk.green(`✓ WIN! Payout: ${betResult.payout}, Balance: ${currentBalance}\n`));
          } else {
            console.log(chalk.red(`✗ LOSS. Balance: ${currentBalance}\n`));
          }

          // Small delay between races
          await this.delay(1000);
        } catch (error) {
          console.error(chalk.red(`Error placing bet: ${error}`));
          break;
        }

        this.raceCount++;
      }

      // Print session summary
      this.statsTracker.printSummary();

      // Print historical analysis
      const report = Analyzer.analyzeHistoricalData();
      Analyzer.printReport(report);

      console.log(chalk.cyan(`📁 Session logs saved to: ${this.logger.getLogFile()}\n`));
    } catch (error) {
      console.error(chalk.red(`Fatal error: ${error}`));
    }
  }

  private analyzeHorses(logs: any[]) {
    const horseMap = new Map<number, any>();

    for (const log of logs) {
      if (!horseMap.has(log.horse)) {
        horseMap.set(log.horse, {
          horse: log.horse,
          totalBets: 0,
          wins: 0,
          losses: 0,
          avgOdds: 0
        });
      }

      const stats = horseMap.get(log.horse);
      stats.totalBets++;
      if (log.result === 'win') {
        stats.wins++;
      } else {
        stats.losses++;
      }
      stats.avgOdds = (stats.avgOdds * (stats.totalBets - 1) + log.odds) / stats.totalBets;
    }

    return Array.from(horseMap.values()).map(h => ({
      ...h,
      winRate: (h.wins / h.totalBets) * 100,
      roi: ((h.wins - h.totalBets) / h.totalBets) * 100
    }));
  }

  private async placeBetWithRetry(
    betConfig: any,
    maxRetries: number = 5,
    initialDelayMs: number = 5000
  ): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.apiClient.placeBet(betConfig);
      } catch (error) {
        lastError = error as Error;

        if (error instanceof ThrottledError) {
          if (attempt < maxRetries) {
            const delayMs = initialDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
            console.log(
              chalk.yellow(
                `⏸️  API throttled! Retry ${attempt}/${maxRetries} in ${(delayMs / 1000).toFixed(1)}s...`
              )
            );
            await this.delay(delayMs);
          } else {
            console.log(chalk.red(`❌ API throttled after ${maxRetries} retries. Stopping.`));
            throw new Error('Maximum retries exceeded due to API throttling');
          }
        } else {
          // Other errors, don't retry
          throw error;
        }
      }
    }

    throw lastError || new Error('Unknown error placing bet');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats() {
    return this.statsTracker.getStats();
  }
}
