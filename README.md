# Vespa Race Betting Bot

An automated betting bot for the Vespa Race game on gewinnspiel.spezi.com. Places strategic bets based on configurable strategies to maximize returns.

## Features

- 🤖 Automated betting with multiple strategies
- 📊 Real-time statistics tracking (ROI, win rate, profit/loss)
- 🎯 Intelligent bet selection based on odds analysis
- 🔄 Support for different betting strategies (greedy, kelly, conservative)
- 💾 Session history tracking

## Installation

```bash
npm install
```

## Build

```bash
npm run build
```

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run start
```

## Configuration

When you run the bot, it will ask for:

1. **Session Cookies**: Your WordPress session cookies (`wordpress_sec` and `wordpress_logged_in`)
   - Get these from Browser DevTools → Application → Cookies
   - Copy the entire cookie value

2. **Nonce**: The security nonce value
   - Found in the game's HTTP requests (check Network tab)
   - Looks like: `29f225d329`

3. **Strategy Selection**:
   - **Greedy**: Picks horses with highest odds (potential for big wins)
   - **Kelly**: Uses Kelly Criterion for optimal growth (mathematically optimal)
   - **Conservative**: Bets on favorites with best odds (safer)

4. **Stake Percentage**: What % of your balance to bet per race (default 10%)

5. **Odds Range**: Filter out extreme bets with min/max odds thresholds

6. **Number of Races**: How many races to run before stopping

## How It Works

1. The bot fetches odds for the current race
2. Analyzes odds and calculates implied probabilities
3. Selects the best bet based on your chosen strategy
4. Places the bet and records the result
5. Repeats until max races reached or balance depleted

### Strategy Details

#### Greedy Strategy
- Picks the horse with the highest odds
- Maximizes potential payout if correct
- Higher risk, higher reward

#### Kelly Criterion
- Mathematically optimal for long-term growth
- Calculates optimal stake fraction: `f* = (p×b - q) / b`
- Where: p = win probability, q = loss probability, b = odds - 1
- Capped at 25% per bet for safety

#### Conservative Strategy
- Picks horses with lower odds (favorites)
- Bets on the most likely winners
- Lower risk, more consistent returns

## Statistics

The bot tracks:
- Total races and win rate
- Starting balance vs current balance
- Total staked and total payout
- Net profit/loss and ROI (%)
- Individual bet history

## Example Output

```
🏁 Vespa Race Betting Bot Started

Strategy: conservative
Max Races: 10
Stake %: 10%

Race 1: Betting 52 on Horse 1 @ 2.5854
  Probability: 38.69%, EV: 0.0026
✓ WIN! Payout: 134, Balance: 682

Race 2: Betting 68 on Horse 6 @ 1.4955
  Probability: 66.81%, EV: 0.0455
✓ WIN! Payout: 101, Balance: 715

╔════════════════════════════════════════╗
║        BETTING SESSION SUMMARY         ║
╠════════════════════════════════════════╣
║ Total Races:         2                  ║
║ Wins:                2                  ║
║ Losses:              0                  ║
║ Win Rate:            100.00%             ║
╠════════════════════════════════════════╣
║ Starting Balance:    620                 ║
║ Current Balance:     715                 ║
║ Total Staked:        120                 ║
║ Total Payout:        235                 ║
╠════════════════════════════════════════╣
║ Net Profit/Loss:     95                  ║
║ ROI:                 15.32%               ║
╚════════════════════════════════════════╝
```

## Notes

- The bot respects rate limits (1s delay between races)
- Session cookies expire after ~30 days
- Always test with small stakes first
- The "best" strategy depends on your risk tolerance and the odds patterns

## Disclaimer

This is a betting bot for entertainment purposes. Betting involves risk of loss. Use responsibly.

## License

MIT
