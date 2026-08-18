import chalk from 'chalk';
import * as readline from 'readline';
import { SessionConfig, StrategyConfig } from './types';

export class CLI {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async prompt(question: string): Promise<string> {
    return new Promise(resolve => {
      this.rl.question(question, resolve);
    });
  }

  async promptNumber(question: string, defaultValue?: number): Promise<number> {
    const answer = await this.prompt(question);
    const num = parseInt(answer, 10);
    if (isNaN(num)) {
      return defaultValue || 0;
    }
    return num;
  }

  async getSessionConfig(): Promise<SessionConfig> {
    console.log(chalk.cyan('\n🏎️  Vespa Race Betting Bot - Configuration\n'));

    // Get cookies
    console.log(chalk.yellow('Step 1: Authentication\n'));
    const cookies = await this.prompt(
      chalk.gray('Enter your session cookies (wordpress_sec and wordpress_logged_in): ')
    );

    if (!cookies) {
      throw new Error('Cookies are required');
    }

    // Get nonce
    const nonce = await this.prompt(chalk.gray('Enter the nonce value: '));
    if (!nonce) {
      throw new Error('Nonce is required');
    }

    // Get max races
    console.log(chalk.yellow('\nStep 2: Bot Configuration\n'));
    const maxRaces = await this.promptNumber(
      chalk.gray('How many races to run? (default 10): '),
      10
    );

    // Get strategy
    console.log(chalk.gray('\nAvailable strategies:'));
    console.log(chalk.gray('  1. greedy - Pick horses with best odds'));
    console.log(chalk.gray('  2. kelly - Kelly Criterion (optimal growth)'));
    console.log(chalk.gray('  3. conservative - Pick favorites with best odds'));

    let strategy = 'conservative';
    const strategyChoice = await this.prompt(
      chalk.gray('Select strategy (1-3, default 3): ')
    );
    const choice = parseInt(strategyChoice, 10);
    if (choice === 1) strategy = 'greedy';
    else if (choice === 2) strategy = 'kelly';

    // Get stake percentage
    const stakePercentage = await this.promptNumber(
      chalk.gray('\nWhat % of balance to stake per race? (default 10): '),
      10
    );

    // Get odds thresholds
    console.log(chalk.gray('\nOdds thresholds (filter out extreme bets):'));
    const minOdds = await this.promptNumber(
      chalk.gray('Minimum odds (default 1.5): '),
      1.5
    );
    const maxOdds = await this.promptNumber(
      chalk.gray('Maximum odds (default 50): '),
      50
    );

    const strategyConfig: StrategyConfig = {
      strategy: strategy as any,
      stakePercentage,
      minOddsThreshold: minOdds,
      maxOddsThreshold: maxOdds
    };

    const sessionConfig: SessionConfig = {
      cookies,
      nonce,
      maxRaces,
      raceId: 0,
      strategyConfig
    };

    return sessionConfig;
  }

  displayConfig(config: SessionConfig): void {
    console.log(chalk.cyan('\n✓ Configuration Summary\n'));
    console.log(chalk.gray('  Strategy: ') + chalk.white(config.strategyConfig.strategy));
    console.log(chalk.gray('  Stake per race: ') + chalk.white(`${config.strategyConfig.stakePercentage}%`));
    console.log(chalk.gray('  Odds range: ') + chalk.white(`${config.strategyConfig.minOddsThreshold} - ${config.strategyConfig.maxOddsThreshold}`));
    console.log(chalk.gray('  Max races: ') + chalk.white(config.maxRaces.toString()));
    console.log('');
  }

  close(): void {
    this.rl.close();
  }
}
