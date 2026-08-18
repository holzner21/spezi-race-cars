import chalk from 'chalk';
import { ApiClient } from './api-client';
import { BettingStrategy } from './strategies';
import { StatsTracker } from './stats-tracker';
import { BetResult, SessionConfig, StrategyConfig } from './types';

export class BettingBot {
  private apiClient: ApiClient;
  private statsTracker: StatsTracker;
  private sessionConfig: SessionConfig;
  private raceCount = 0;

  constructor(sessionConfig: SessionConfig, startingBalance: number) {
    this.sessionConfig = sessionConfig;
    this.apiClient = new ApiClient(sessionConfig.cookies);
    this.statsTracker = new StatsTracker(startingBalance);
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
          this.sessionConfig.strategyConfig
        );

        if (!betDecision) {
          console.log(chalk.yellow(`Race ${this.raceCount + 1}: No suitable bets found. Skipping.`));
          this.raceCount++;
          continue;
        }

        // Place bet
        console.log(
          chalk.blue(
            `Race ${this.raceCount + 1}: Betting ${betDecision.stake} on Horse ${betDecision.horse} @ ${betDecision.odds.toFixed(4)}`
          )
        );
        console.log(chalk.gray(`  ${betDecision.reason}`));

        try {
          const result = await this.apiClient.placeBet({
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

      this.statsTracker.printSummary();
    } catch (error) {
      console.error(chalk.red(`Fatal error: ${error}`));
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats() {
    return this.statsTracker.getStats();
  }
}
