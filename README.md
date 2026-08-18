# Vespa Race Betting Bot

An automated betting bot for the Vespa Race game on gewinnspiel.spezi.com. Places strategic bets based on configurable strategies to maximize returns, with intelligent learning from historical data.

## Features

- 🤖 Automated betting with multiple strategies
- 📊 Real-time statistics tracking (ROI, win rate, profit/loss)
- 🎯 Intelligent bet selection based on odds analysis
- 🔄 Support for different betting strategies (greedy, kelly, conservative)
- 💾 Session history tracking with JSON logs
- 📈 Historical data analysis with horse performance metrics
- 🧠 Self-learning algorithm that improves bets based on past results
- 🌡️ Identifies hot/cold horses and optimal odds ranges

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

## Logging & Analysis

### Session Logs

Every session is automatically logged to `.betting-logs/session-{timestamp}.json` containing:
- Timestamp of each bet
- Horse number and odds
- Stake amount and result
- Payout and balance after bet
- Strategy used

### Historical Analysis

After each session, the bot analyzes all logged sessions and displays:

1. **Overall Statistics**
   - Total bets placed across all sessions
   - Win rate
   - Total profit/loss

2. **Horse Performance**
   - Win rate per horse
   - Average odds and payout
   - ROI for each horse
   - Hot horses (>50% win rate) - good betting targets
   - Cold horses (<20% win rate) - horses to avoid

3. **Odds Analysis**
   - Win rate by odds range
   - Best performing odds ranges
   - Helps optimize odds thresholds

4. **Smart Recommendations**
   - Identifies profitable patterns
   - Suggests which horses to favor
   - Recommends odds ranges to target
   - Alerts if performance is deteriorating

### Self-Learning Algorithm

The bot uses historical data to improve betting decisions:

- **First bets**: Uses implied probability from odds
- **Subsequent bets**: Incorporates historical win rates per horse
- **Dynamic strategy**: Adjusts based on accumulated data
- **Better accuracy**: Over time, bets become more accurate as data grows

```
Example flow:
Session 1: No historical data → uses odds-based probabilities
Session 2: Uses data from Session 1 to improve bets
Session 3: Uses data from Sessions 1-2 for even better accuracy
...and so on
```

## Example Output

```
🏁 Vespa Race Betting Bot Started

Strategy: conservative
Max Races: 10
Stake %: 10%

📊 Using historical data to improve bets

Race 1: Betting 52 on Horse 1 @ 2.5854
  Probability: 38.69%, EV: 0.0026
✓ WIN! Payout: 134, Balance: 682

Race 2: Betting 68 on Horse 6 @ 1.4955
  Probability: 66.81%, EV: 0.0455 [Historical]
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

╔════════════════════════════════════════════════════════╗
║           HISTORICAL BETTING ANALYSIS                  ║
╠════════════════════════════════════════════════════════╣
║ Total Bets:              25                            ║
║ Total Wins:              18                            ║
║ Overall Win Rate:        72.00%                        ║
║ Total Profit:            450                           ║
╠════════════════════════════════════════════════════════╣
║ 🔥 HOT HORSES (>50% win rate):                         ║
║   Horse 1: 85.0% (17/20)                               ║
║   Horse 6: 60.0% (3/5)                                 ║
║ ❄️  COLD HORSES (<20% win rate):                       ║
║   Horse 3: 10.0% (1/10)                                ║
╠════════════════════════════════════════════════════════╣
║ 💡 RECOMMENDATIONS:                                    ║
║ 🐴 Horse 1 has 85.0% win rate - consider betting       ║
║    more on it                                           ║
║ 📊 Best odds range: 1.5-2.5 (72.5% win rate)          ║
║ ✅ Overall profitable! ROI: 12.5% - keep current      ║
║    strategy                                             ║
╚════════════════════════════════════════════════════════╝

📁 Session logs saved to: .betting-logs/session-2026-08-18T...json
```

## File Structure

```
.betting-logs/              # Session logs (auto-created)
  session-{timestamp}.json  # Individual session bet history
src/
  api-client.ts            # API communication
  betting-bot.ts           # Main bot orchestration
  cli.ts                   # Interactive CLI
  strategies.ts            # Betting strategy logic (with historical data)
  stats-tracker.ts         # Session statistics
  logger.ts                # Logging to JSON files
  analyzer.ts              # Historical data analysis
  types.ts                 # TypeScript interfaces
  index.ts                 # Entry point
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
