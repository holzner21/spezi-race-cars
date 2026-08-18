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
    console.log(chalk.gray('To get your cookies:'));
    console.log(chalk.gray('  1. Open the game at https://gewinnspiel.spezi.com/vespa-race/'));
    console.log(chalk.gray('  2. Press F12 → Application tab → Cookies'));
    console.log(chalk.gray('  3. Copy the full value of "wordpress_sec" and "wordpress_logged_in"\n'));
    
    const cookies = await this.prompt(
      chalk.gray('Enter your session cookies: ')
    );

    if (!cookies) {
      throw new Error('Cookies are required');
    }

    // Get nonce
    console.log(chalk.gray('\nTo get the nonce:'));
    console.log(chalk.gray('  1. Open DevTools → Network tab'));
    console.log(chalk.gray('  2. Refresh the page and look for a POST to "admin-ajax.php"'));
    console.log(chalk.gray('  3. Check Request → Form Data → look for "nonce" value\n'));
    
    const nonce = await this.prompt(chalk.gray('Enter the nonce value: '));
    if (!nonce) {
      throw new Error('Nonce is required');
    }

    // Get race ID
    console.log(chalk.gray('\nTo get the current race ID:'));
    console.log(chalk.gray('  1. In the Network tab, find the admin-ajax.php response'));
    console.log(chalk.gray('  2. Look for "race_id" in the response'));
    console.log(chalk.gray('  3. Or use the race_id from the request parameters\n'));
    
    const raceId = await this.promptNumber(
      chalk.gray('Enter the current race ID: ')
    );
    if (!raceId) {
      throw new Error('Race ID is required');
    }

    // Get max races
    console.log(chalk.yellow('\nStep 2: Bot Configuration\n'));
    const maxRaces = await this.promptNumber(
      chalk.gray('How many races to run? (default 10): '),
      10
    );

    const raceDelaySeconds = await this.promptNumber(
      chalk.gray('Delay between races in seconds? (default 30): '),
      30
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
      raceId,
      maxRaces,
      raceDelayMs: Math.max(1, raceDelaySeconds) * 1000,
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
    console.log(chalk.gray('  Delay between races: ') + chalk.white(`${(config.raceDelayMs ?? 30000) / 1000}s`));
    console.log('');
  }

  close(): void {
    this.rl.close();
  }
}
