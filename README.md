# Vespa Race Betting Bot

An automated betting bot for the Vespa Race game on gewinnspiel.spezi.com. Places strategic bets based on configurable strategies to maximize returns, with intelligent learning from historical data.

## Features

- 🤖 Automated betting with multiple strategies (greedy, kelly, conservative)
- 📊 Real-time statistics tracking (ROI, win rate, profit/loss)
- 🎯 Intelligent bet selection based on odds analysis
- 💾 **SQLite race log** — stores every race's full finish order, pre-race win/place/exacta/trifecta odds, and bet details
- 📈 Historical data analysis with horse performance metrics
- 🧠 Self-learning algorithm that improves bets based on past results
- 🤖 Auto-betting mode that switches strategies based on live performance
- 🔬 **Backtesting simulator** — replay stored races to compare strategies without risking real money
- ⚡ Smart rate limiting with exponential backoff

## Installation

```bash
npm install
```

## Build

```bash
npm run build
```

## Testing

```bash
npm test               # run all tests
npm run test:watch     # re-run on changes
npm run test:coverage  # with coverage report
```

### Test Files

- [tests/strategies.test.ts](tests/strategies.test.ts) — betting strategy logic
- [tests/logger.test.ts](tests/logger.test.ts) — SQLite session logging
- [tests/analyzer.test.ts](tests/analyzer.test.ts) — historical data analysis
- [tests/auto-betting.test.ts](tests/auto-betting.test.ts) — auto mode control flow
- [tests/simulator.test.ts](tests/simulator.test.ts) — backtesting simulator

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build && npm start
```

### CLI flags

| Flag | Effect |
|---|---|
| `--dry-run` / `--dryrun` | Simulate bets without calling the real API |
| `--auto` / `--autobetting` | Start directly in auto-betting mode |

## Configuration

When you run the bot, it will ask for:

1. **Session Cookies** — your WordPress session cookies (`wordpress_sec` and `wordpress_logged_in`)  
   Get them from Browser DevTools → Application → Cookies.

2. **Nonce** — the security nonce from the game's HTTP requests (Network tab), e.g. `29f225d329`.

3. **Strategy**:
   - **Conservative** — bets on favorites (lowest odds). Safer, more consistent.
   - **Kelly** — Kelly Criterion, mathematically optimal long-term growth: `f* = (p×b - q) / b`, capped at 25%.
   - **Greedy** — highest odds, highest potential payout, highest risk.

4. **Stake Percentage** — % of current balance to bet per race (default 10%).

5. **Odds Range** — min/max thresholds to filter extreme bets.

6. **Auto-Betting Mode** — adaptive strategy switching. Runs for a fixed count or indefinitely.

7. **Number of Races** — how many races before stopping.

8. **Delay Between Races** — seconds between bets (default 30 s, matches frontend cadence).

## How It Works

1. Bot fetches odds for the current race from the API.
2. Chosen strategy selects the best horse and stake size.
3. Bet is placed; the full API response is saved to SQLite — finish order, payout, balance, and all four odds tables.
4. In auto mode, the active strategy is re-evaluated before each race based on balance trend, recent win rate, and historical data.
5. After the session, historical analysis and recommendations are printed.

## Logging & Analysis

### SQLite Race Database

All data is stored in `.betting-logs/races.db`. Every race record includes:

| Column | What's stored |
|---|---|
| `finish_order` | Actual finish positions, e.g. `[3,5,1,2,6,4]` |
| `win_odds` | Pre-race win odds for all 6 horses |
| `place_odds` | Pre-race place odds |
| `exacta_odds` | Full exacta odds matrix |
| `trifecta_odds` | Full trifecta odds cube |
| `our_result` | `win` or `loss` |
| `payout` | Actual payout received |
| `balance_after` | Balance after the race |

The linked `bets` table stores the horse picked, stake, bet type, odds at bet time, and strategy used.

You can query the database directly:

```bash
sqlite3 .betting-logs/races.db

# Win rate per horse across all sessions
SELECT json_each.value AS horse,
       COUNT(*) AS total,
       SUM(CASE WHEN finish_order LIKE json_each.value || ',%'
                  OR finish_order LIKE '[' || json_each.value || ',%' THEN 1 ELSE 0 END) AS wins
FROM races, json_each(finish_order)
GROUP BY horse;

# Average win odds for horse 1 over time
SELECT AVG(json_extract(win_odds, '$.1')) FROM races WHERE win_odds != '{}';

# All bets and their outcomes
SELECT r.race_id, b.horse_picked, b.stake, b.odds_at_bet, r.our_result, r.payout
FROM races r JOIN bets b ON b.race_fk = r.id
ORDER BY r.timestamp DESC LIMIT 20;
```

### Historical Analysis

After each session the bot prints:

- Overall win rate and profit
- Per-horse win rate, average odds, and ROI
- Best-performing odds range
- Hot horses (>50% win rate) and cold horses (<20%)
- Recommendations for adjusting strategy

## Backtesting Simulator

The simulator replays every stored race against one or more strategy configurations, using the **actual recorded finish order** as ground truth. No API calls are made.

### Run from code

```typescript
import { Simulator } from './src/simulator';

// Test a single strategy
const result = Simulator.run(
  { strategy: 'conservative', minOddsThreshold: 1.5, maxOddsThreshold: 10, stakePercentage: 10 },
  1000  // starting balance
);
Simulator.printResult(result);

// Compare strategies side-by-side
const comparison = Simulator.compare(
  [
    { strategy: 'conservative', minOddsThreshold: 1.5, maxOddsThreshold: 10, stakePercentage: 10 },
    { strategy: 'kelly',        minOddsThreshold: 1.5, maxOddsThreshold: 20, stakePercentage: 10 },
    { strategy: 'greedy',       minOddsThreshold: 2.0, maxOddsThreshold: 25, stakePercentage:  5 },
  ],
  1000
);
Simulator.printComparison(comparison);
```

### Example output

```
📊 Simulation — strategy: conservative[min=1.5,max=10,stake=10%]
──────────────────────────────────────────────────
  Races available  : 120
  Bets placed      : 98   (skipped: 22)
  Wins / Losses    : 41 / 57
  Win rate         : 41.84%
  Total staked     : 9241.00
  Total payout     : 8610.00
  Net profit       : -631.00
  ROI              : -6.83%
  Starting balance : 1000
  Final balance    : 369.00
  Peak balance     : 1182.00
  Max drawdown     : 813.00

📊 Simulation — strategy: kelly[min=1.5,max=20,stake=10%]
──────────────────────────────────────────────────
  ...
```

### What "skipped" means

A race is skipped when no horse falls within the configured `minOddsThreshold`–`maxOddsThreshold` range. Adjust these values to change how selective the strategy is.

### Only races with full odds are simulated

Races logged before the SQLite upgrade (old JSON sessions) or races logged via the legacy `logBet()` shim store empty odds and are excluded from simulation. Only races recorded by the live/auto betting loop (which calls `logRace()`) carry full odds data.

## Rate Limiting & Throttling

The bot detects API throttling and uses **exponential backoff** with up to 5 retries:

```
⏸️  API throttled! Retry 1/5 in 5.0s...
⏸️  API throttled! Retry 2/5 in 10.0s...
✓ WIN! Payout: 150, Balance: 850
```

The default 30-second delay between races matches the frontend race cadence and significantly reduces throttling frequency.

## File Structure

```
.betting-logs/
  races.db              # SQLite database — all race history
src/
  db.ts                 # SQLite connection and schema migrations
  logger.ts             # Race + bet logging (SQLite)
  simulator.ts          # Backtesting engine
  analyzer.ts           # Historical data analysis and recommendations
  betting-bot.ts        # Main bot orchestration
  strategies.ts         # Bet selection logic
  stats-tracker.ts      # Per-session statistics
  cli.ts                # Interactive CLI prompts
  api-client.ts         # API communication
  types.ts              # TypeScript interfaces
  index.ts              # Entry point
```

## Notes

- Session cookies expire after ~30 days.
- Always test with small stakes or dry-run mode first.
- The more races you log with full odds, the more useful the simulator becomes.

## Disclaimer

This is a betting bot for entertainment purposes. Betting involves risk of loss. Use responsibly.

## License

MIT
