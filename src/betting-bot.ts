import chalk from 'chalk';
import { ApiClient, ThrottledError } from './api-client';
import { BettingStrategy } from './strategies';
import { StatsTracker } from './stats-tracker';
import { Logger } from './logger';
import { Analyzer } from './analyzer';
import { BetResult, SessionConfig, StrategyConfig } from './types';
import { chooseAutoStrategy, shouldContinueAutoBetting } from './auto-betting';

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
    this.logger = new Logger(sessionConfig.strategyConfig.strategy, startingBalance);
  }

  async run(): Promise<void> {
    if (this.sessionConfig.dryRun) {
      await this.runDryRun();
      return;
    }

    if (this.sessionConfig.autoBetting?.enabled) {
      await this.runAutoMode();
      return;
    }

    const raceDelayMs = this.sessionConfig.raceDelayMs ?? 30000;

    console.log(chalk.cyan('\n🏁 Vespa Race Betting Bot Started\n'));
    console.log(chalk.gray(`Strategy: ${this.sessionConfig.strategyConfig.strategy}`));
    console.log(chalk.gray(`Max Races: ${this.sessionConfig.maxRaces}`));
    console.log(chalk.gray(`Stake %: ${this.sessionConfig.strategyConfig.stakePercentage}%\n`));
    console.log(chalk.gray(`Race delay: ${(raceDelayMs / 1000).toFixed(0)}s\n`));

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
          const balanceBefore = currentBalance;
          const oddsForThisRace = currentOdds!;
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
          this.logger.logRace(currentRaceId, oddsForThisRace, betResult, result.data, balanceBefore);
          currentBalance = result.data.new_balance;
          currentRaceId = result.data.next_race.race_id;
          currentOdds = result.data.next_race.odds;

          if (betResult.result === 'win') {
            console.log(chalk.green(`✓ WIN! Payout: ${betResult.payout}, Balance: ${currentBalance}\n`));
          } else {
            console.log(chalk.red(`✗ LOSS. Balance: ${currentBalance}\n`));
          }

          // Keep pace with the frontend race cadence to avoid API throttling.
          await this.delay(raceDelayMs);
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

  private async runDryRun(): Promise<void> {
    const raceDelayMs = this.sessionConfig.raceDelayMs ?? 30000;
    const startingBalance = this.statsTracker.getStats().currentBalance;

    console.log(chalk.cyan('\n🧪 Dry-run simulation started\n'));
    console.log(chalk.gray(`Strategy: ${this.sessionConfig.strategyConfig.strategy}`));
    console.log(chalk.gray(`Max Races: ${this.sessionConfig.maxRaces}`));
    console.log(chalk.gray(`Stake %: ${this.sessionConfig.strategyConfig.stakePercentage}%`));
    console.log(chalk.gray(`Race delay: ${(raceDelayMs / 1000).toFixed(0)}s\n`));

    let currentBalance = startingBalance;
    const historicalLogs = Logger.loadAllHistoricalLogs();
    const horseStats = this.analyzeHorses(historicalLogs);
    let currentOdds = this.buildSimulationOdds(horseStats);

    while (this.raceCount < this.sessionConfig.maxRaces) {
      const betDecision = BettingStrategy.decideBet(
        currentOdds,
        currentBalance,
        this.sessionConfig.strategyConfig,
        horseStats.length > 0 ? horseStats : undefined
      );

      if (!betDecision) {
        console.log(chalk.yellow(`Race ${this.raceCount + 1}: No suitable bets found in dry run. Skipping.`));
        this.raceCount++;
        continue;
      }

      const winner = this.simulateRaceWinner(currentOdds, horseStats);
      const result: 'win' | 'loss' = winner === betDecision.horse ? 'win' : 'loss';
      const payout = result === 'win' ? Math.round(betDecision.stake * betDecision.odds) : 0;
      const newBalance = currentBalance - betDecision.stake + payout;

      const betResult: BetResult = {
        raceId: this.raceCount + 1,
        horsePicked: betDecision.horse,
        stakeAmount: betDecision.stake,
        betType: 'win',
        odds: betDecision.odds,
        result,
        payout,
        finishOrder: [winner],
        newBalance
      };

      this.statsTracker.recordBet(betResult);
      this.logger.logBet(betResult, `dry-run:${this.sessionConfig.strategyConfig.strategy}`); // dry-run has no real API odds

      console.log(
        chalk.blue(
          `Race ${this.raceCount + 1}: Dry-run bet ${betDecision.stake} on Horse ${betDecision.horse} @ ${betDecision.odds.toFixed(4)}`
        )
      );
      console.log(chalk.gray(`  ${betDecision.reason}`));
      console.log(result === 'win'
        ? chalk.green(`✓ WIN! Payout: ${payout}, Balance: ${newBalance}\n`)
        : chalk.red(`✗ LOSS. Balance: ${newBalance}\n`));

      currentBalance = newBalance;
      currentOdds = this.buildSimulationOdds(horseStats);
      this.raceCount++;

      if (raceDelayMs > 0) {
        await this.delay(raceDelayMs);
      }
    }

    this.statsTracker.printSummary();
    const report = Analyzer.analyzeHistoricalData();
    Analyzer.printReport(report);
    console.log(chalk.cyan(`📁 Dry-run session saved to: ${this.logger.getLogFile()}\n`));
  }

  private async runAutoMode(): Promise<void> {
    const raceDelayMs = this.sessionConfig.raceDelayMs ?? 30000;
    const autoConfig = this.sessionConfig.autoBetting;

    console.log(chalk.cyan('\n🤖 Auto-betting mode started\n'));
    console.log(chalk.gray(`Seed strategy: ${this.sessionConfig.strategyConfig.strategy}`));
    console.log(chalk.gray(`Max Races: ${this.sessionConfig.maxRaces}`));
    console.log(chalk.gray(`Stake %: ${this.sessionConfig.strategyConfig.stakePercentage}%\n`));
    console.log(chalk.gray(`Race delay: ${(raceDelayMs / 1000).toFixed(0)}s\n`));

    let currentRaceId = this.sessionConfig.raceId || 0;
    let currentBalance = 0;
    let currentOdds = null;
    let activeStrategy = this.sessionConfig.strategyConfig.strategy;

    if (this.raceCount === 0) {
      console.log(chalk.cyan('📋 Fetching initial race data...'));
      try {
        const initResult = await this.apiClient.placeBet({
          action: 'vespa_race_play',
          nonce: this.sessionConfig.nonce,
          race_id: currentRaceId,
          bet_type: 'win',
          picks: 1,
          stake: 1
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

    while (shouldContinueAutoBetting(this.raceCount, this.sessionConfig.maxRaces, autoConfig)) {
      if (!currentOdds) {
        console.log(chalk.red('No odds data available'));
        break;
      }

      const historicalLogs = Logger.loadAllHistoricalLogs();
      const horseStats = this.analyzeHorses(historicalLogs);
      const liveStats = this.statsTracker.getStats();

      if (autoConfig) {
        const choice = chooseAutoStrategy(
          currentOdds,
          currentBalance,
          this.sessionConfig.strategyConfig,
          horseStats,
          liveStats,
          activeStrategy,
          autoConfig
        );

        if (choice) {
          activeStrategy = choice.strategy;
          console.log(chalk.gray(`  Auto strategy: ${choice.reason}`));
        }
      }

      const betDecision = BettingStrategy.decideBet(
        currentOdds,
        currentBalance,
        { ...this.sessionConfig.strategyConfig, strategy: activeStrategy },
        horseStats.length > 0 ? horseStats : undefined
      );

      if (!betDecision) {
        console.log(chalk.yellow(`Race ${this.raceCount + 1}: No suitable bets found. Skipping.`));
        this.raceCount++;
        continue;
      }

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

        const balanceBefore = currentBalance;
        const oddsForThisRace = currentOdds!;
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
        this.logger.logRace(currentRaceId, oddsForThisRace, betResult, result.data, balanceBefore);
        currentBalance = result.data.new_balance;
        currentRaceId = result.data.next_race.race_id;
        currentOdds = result.data.next_race.odds;

        if (betResult.result === 'win') {
          console.log(chalk.green(`✓ WIN! Payout: ${betResult.payout}, Balance: ${currentBalance}\n`));
        } else {
          console.log(chalk.red(`✗ LOSS. Balance: ${currentBalance}\n`));
        }

        await this.delay(raceDelayMs);
      } catch (error) {
        console.error(chalk.red(`Error placing bet: ${error}`));
        break;
      }

      this.raceCount++;
    }

    this.statsTracker.printSummary();
    const report = Analyzer.analyzeHistoricalData();
    Analyzer.printReport(report);

    console.log(chalk.cyan(`📁 Session logs saved to: ${this.logger.getLogFile()}\n`));
  }

  private buildSimulationOdds(horseStats: any[]): any {
    const baseOdds: Record<string, number> = {
      '1': 2.5,
      '2': 3.0,
      '3': 4.0,
      '4': 5.5,
      '5': 7.5,
      '6': 9.0
    };

    if (horseStats.length === 0) {
      return { win: baseOdds, place: {}, exacta: {}, trifecta: {} };
    }

    const odds: Record<string, number> = {};
    for (let horse = 1; horse <= 6; horse++) {
      const stats = horseStats.find(entry => entry.horse === horse);
      const historicalWinRate = stats ? stats.winRate / 100 : 0.2;
      const inferredOdds = 1 / Math.max(0.08, Math.min(0.9, historicalWinRate));
      const fallbackOdds = baseOdds[String(horse)] ?? 4.0;
      odds[String(horse)] = Number(Math.max(1.5, Math.min(25, stats ? inferredOdds : fallbackOdds)).toFixed(4));
    }

    return { win: odds, place: {}, exacta: {}, trifecta: {} };
  }

  private simulateRaceWinner(odds: any, horseStats: any[]): number {
    const horseEntries = Object.entries(odds.win) as [string, number][];
    const weights = horseEntries.map(([horse, horseOdds]) => {
      const horseNumber = Number(horse);
      const historical = horseStats.find(entry => entry.horse === horseNumber);
      const historicalWeight = historical ? Math.max(0.05, historical.winRate / 100) : Math.max(0.08, 1 / horseOdds);
      return { horse: horseNumber, weight: historicalWeight };
    });

    const totalWeight = weights.reduce((sum, next) => sum + next.weight, 0);
    let threshold = Math.random() * totalWeight;

    for (const entry of weights) {
      threshold -= entry.weight;
      if (threshold <= 0) {
        return entry.horse;
      }
    }

    return weights[weights.length - 1].horse;
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
