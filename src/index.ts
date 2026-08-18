import chalk from 'chalk';
import { BettingBot } from './betting-bot';
import { CLI } from './cli';
import { ApiClient } from './api-client';

async function main() {
  const cli = new CLI();

  try {
    // Get configuration from user
    const sessionConfig = await cli.getSessionConfig();
    cli.displayConfig(sessionConfig);

    // First, try to fetch initial race data
    console.log(chalk.cyan('Fetching initial race data...\n'));
    const apiClient = new ApiClient(sessionConfig.cookies);

    // Get initial balance by making a dummy bet request
    // Actually, we need the current race_id first. Let's ask the user
    const initialRaceId = await cli.promptNumber(
      chalk.gray('Enter the current race ID (from the game): ')
    );

    if (!initialRaceId) {
      throw new Error('Race ID is required');
    }

    sessionConfig.raceId = initialRaceId;

    // Confirm and start
    const confirm = await cli.prompt(chalk.yellow('\nStart betting? (yes/no): '));
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log(chalk.gray('Cancelled.'));
      cli.close();
      return;
    }

    cli.close();

    // Run bot
    const bot = new BettingBot(sessionConfig, 1000); // Assuming starting balance or fetch it
    await bot.run();
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    cli.close();
    process.exit(1);
  }
}

main();
