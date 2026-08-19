import chalk from 'chalk';
import { BettingBot } from './betting-bot';
import { CLI } from './cli';

async function main() {
  const cli = new CLI();
  const args = process.argv.slice(2);
  const dryRunFlag = args.includes('--dry-run') || args.includes('--dryrun');

  try {
    // Get configuration from user
    const sessionConfig = await cli.getSessionConfig();
    sessionConfig.dryRun = sessionConfig.dryRun || dryRunFlag;
    cli.displayConfig(sessionConfig);

    if (dryRunFlag) {
      cli.close();
    } else {
      // Confirm and start
      const confirm = await cli.prompt(chalk.yellow('\nStart betting? (yes/no): '));
      if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
        console.log(chalk.gray('Cancelled.'));
        cli.close();
        return;
      }

      cli.close();
    }

    // Run bot (starting balance will be fetched during initialization)
    const bot = new BettingBot(sessionConfig, 1000);
    await bot.run();
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    cli.close();
    process.exit(1);
  }
}

main();
