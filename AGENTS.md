# Agent Instructions for spezi-race-cars

## Project Shape

This is a TypeScript CLI betting bot for the Vespa Race game. The main flow starts in [src/index.ts](src/index.ts), prompts and configuration live in [src/cli.ts](src/cli.ts), betting logic is in [src/betting-bot.ts](src/betting-bot.ts) and [src/strategies.ts](src/strategies.ts), and persistence/reporting is handled by [src/logger.ts](src/logger.ts) and [src/analyzer.ts](src/analyzer.ts). Use [README.md](README.md) for the user-facing setup and usage flow.

## Commands

- `npm run dev` runs the bot through `ts-node`.
- `npm run build` compiles TypeScript to `dist/`.
- `npm start` runs the compiled build.
- `npm test` runs the Jest suite.
- `npm run test:watch` runs Jest in watch mode.
- `npm run test:coverage` generates coverage output.
- `npm run clean` removes `dist/`.

## Working Rules

- Keep changes aligned with the existing CLI-driven workflow: cookies, nonce, race ID, strategy, stake percentage, odds thresholds, and race delay are all collected through the prompt flow.
- Preserve the default race pacing behavior. The code defaults to a 30 second delay between races, and the bot uses that pacing to avoid throttling.
- Respect dry-run mode. It is supported both from the CLI prompt and via the `--dry-run` or `--dryrun` flag in [src/index.ts](src/index.ts).
- Session logs are written under `.betting-logs/` in the current working directory. Tests and new code that touch logging should clean up generated files.
- Keep strategy and configuration types in [src/types.ts](src/types.ts) as the source of truth for cross-module contracts.

## Testing Expectations

- Tests use Jest with `ts-jest` and run in a Node environment, configured in [jest.config.js](jest.config.js).
- Existing tests show the preferred style: isolate behavior, mock external dependencies, and clean up generated files after each test when needed.
- When changing behavior in a touched slice, validate with the narrowest useful command first, usually `npm test` or a focused Jest run if you add one.

## Useful Anchors

- [src/index.ts](src/index.ts) for top-level control flow.
- [src/cli.ts](src/cli.ts) for input collection and defaults.
- [src/betting-bot.ts](src/betting-bot.ts) for race loop, retries, and dry-run handling.
- [tests/strategies.test.ts](tests/strategies.test.ts), [tests/logger.test.ts](tests/logger.test.ts), and [tests/analyzer.test.ts](tests/analyzer.test.ts) for concrete examples of the expected test style.