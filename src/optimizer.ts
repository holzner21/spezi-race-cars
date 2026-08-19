import { Logger, RaceRecord } from './logger';
import { BettingStrategy } from './strategies';
import { RaceOdds, StrategyConfig } from './types';

export interface SimulationMetrics {
  name: string;
  betsPlaced: number;
  wins: number;
  losses: number;
  skipped: number;
  winRate: number;
  totalStaked: number;
  totalPayout: number;
  netProfit: number;
  roi: number;
  finalBalance: number;
  maxDrawdown: number;
}

export interface ProbabilityModelConfig {
  name: string;
  minOdds: number;
  maxOdds: number;
  minEdge: number;
  horseWeight: number;
  bucketWeight: number;
  impliedWeight: number;
  stakePct: number;
  kellyMultiplier: number;
  maxStakePct: number;
}

interface RunningStats {
  observedRaces: number;
  horseWins: Map<number, number>;
  bucketWins: Map<number, number>;
  bucketSamples: Map<number, number>;
}

interface BetCandidate {
  horse: number;
  odds: number;
  probability: number;
  edge: number;
}

const HORSE_COUNT = 6;
const ODDS_BUCKETS: Array<{ min: number; max: number }> = [
  { min: 1.0, max: 2.5 },
  { min: 2.5, max: 5.0 },
  { min: 5.0, max: 10.0 },
  { min: 10.0, max: Number.POSITIVE_INFINITY }
];

function hasFullOdds(race: RaceRecord): boolean {
  return Object.keys(race.winOdds).length > 0;
}

function getBucketIndex(odds: number): number {
  for (let i = 0; i < ODDS_BUCKETS.length; i++) {
    const b = ODDS_BUCKETS[i];
    if (odds >= b.min && odds < b.max) return i;
  }
  return ODDS_BUCKETS.length - 1;
}

function getImpliedProbability(odds: number): number {
  return 1 / odds;
}

function getHorseProbability(stats: RunningStats, horse: number): number {
  const wins = stats.horseWins.get(horse) ?? 0;
  // Laplace smoothing prevents unstable estimates in early races.
  return (wins + 1) / (stats.observedRaces + HORSE_COUNT);
}

function getBucketProbability(stats: RunningStats, bucketIndex: number): number {
  const wins = stats.bucketWins.get(bucketIndex) ?? 0;
  const samples = stats.bucketSamples.get(bucketIndex) ?? 0;
  // Beta(1,1) prior keeps probabilities bounded away from zero/one.
  return (wins + 1) / (samples + 2);
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function computeKellyFraction(odds: number, probability: number): number {
  const b = odds - 1;
  if (b <= 0) return 0;
  const raw = ((probability * odds) - 1) / b;
  return Math.max(0, raw);
}

function buildCandidate(
  horse: number,
  odds: number,
  model: ProbabilityModelConfig,
  stats: RunningStats
): BetCandidate {
  const implied = getImpliedProbability(odds);
  const bucketIndex = getBucketIndex(odds);
  const horseP = getHorseProbability(stats, horse);
  const bucketP = getBucketProbability(stats, bucketIndex);

  const weightedP = clamp01(
    model.horseWeight * horseP +
      model.bucketWeight * bucketP +
      model.impliedWeight * implied
  );

  const edge = weightedP * odds - 1;

  return { horse, odds, probability: weightedP, edge };
}

function updateRunningStats(stats: RunningStats, race: RaceRecord): void {
  stats.observedRaces += 1;

  const winner = race.finishOrder[0];
  const winnerWins = stats.horseWins.get(winner) ?? 0;
  stats.horseWins.set(winner, winnerWins + 1);

  for (const [horseStr, odds] of Object.entries(race.winOdds)) {
    const horse = Number(horseStr);
    const bucketIndex = getBucketIndex(odds);
    const prevSamples = stats.bucketSamples.get(bucketIndex) ?? 0;
    stats.bucketSamples.set(bucketIndex, prevSamples + 1);

    if (horse === winner) {
      const prevWins = stats.bucketWins.get(bucketIndex) ?? 0;
      stats.bucketWins.set(bucketIndex, prevWins + 1);
    }
  }
}

function cloneRunningStats(stats: RunningStats): RunningStats {
  return {
    observedRaces: stats.observedRaces,
    horseWins: new Map(stats.horseWins),
    bucketWins: new Map(stats.bucketWins),
    bucketSamples: new Map(stats.bucketSamples)
  };
}

function buildRunningStatsFromRecords(records: RaceRecord[]): RunningStats {
  const stats: RunningStats = {
    observedRaces: 0,
    horseWins: new Map<number, number>(),
    bucketWins: new Map<number, number>(),
    bucketSamples: new Map<number, number>()
  };

  for (const race of records) {
    updateRunningStats(stats, race);
  }

  return stats;
}

function simulateImprovedModel(
  records: RaceRecord[],
  model: ProbabilityModelConfig,
  initialBalance = 1000,
  seedStats?: RunningStats
): SimulationMetrics {
  let balance = initialBalance;
  let peakBalance = initialBalance;
  let maxDrawdown = 0;
  let wins = 0;
  let losses = 0;
  let skipped = 0;
  let totalStaked = 0;
  let totalPayout = 0;

  const runningStats: RunningStats = seedStats
    ? cloneRunningStats(seedStats)
    : {
      observedRaces: 0,
      horseWins: new Map<number, number>(),
      bucketWins: new Map<number, number>(),
      bucketSamples: new Map<number, number>()
    };

  for (const race of records) {
    const candidates: BetCandidate[] = [];

    for (const [horseStr, odds] of Object.entries(race.winOdds)) {
      const horse = Number(horseStr);
      if (odds < model.minOdds || odds > model.maxOdds) {
        continue;
      }
      candidates.push(buildCandidate(horse, odds, model, runningStats));
    }

    candidates.sort((a, b) => b.edge - a.edge);
    const best = candidates[0];

    if (!best || best.edge < model.minEdge) {
      skipped += 1;
      updateRunningStats(runningStats, race);
      continue;
    }

    const kelly = computeKellyFraction(best.odds, best.probability);
    const dynamicStakePct = Math.min(model.stakePct * Math.max(0.1, kelly * model.kellyMultiplier), model.maxStakePct);
    const stake = Math.max(1, Math.floor(balance * dynamicStakePct / 100));

    const winner = race.finishOrder[0];
    const won = best.horse === winner;
    const payout = won ? Math.round(stake * best.odds) : 0;

    balance = balance - stake + payout;
    totalStaked += stake;
    totalPayout += payout;

    if (won) {
      wins += 1;
    } else {
      losses += 1;
    }

    if (balance > peakBalance) {
      peakBalance = balance;
    }
    const drawdown = peakBalance - balance;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }

    updateRunningStats(runningStats, race);
  }

  const betsPlaced = wins + losses;
  const winRate = betsPlaced > 0 ? (wins / betsPlaced) * 100 : 0;
  const netProfit = balance - initialBalance;
  const roi = totalStaked > 0 ? (netProfit / totalStaked) * 100 : 0;

  return {
    name: model.name,
    betsPlaced,
    wins,
    losses,
    skipped,
    winRate,
    totalStaked,
    totalPayout,
    netProfit,
    roi,
    finalBalance: balance,
    maxDrawdown
  };
}

function simulateBaseline(
  records: RaceRecord[],
  config: StrategyConfig,
  initialBalance = 1000
): SimulationMetrics {
  let balance = initialBalance;
  let peakBalance = initialBalance;
  let maxDrawdown = 0;
  let wins = 0;
  let losses = 0;
  let skipped = 0;
  let totalStaked = 0;
  let totalPayout = 0;

  const raceOdds: RaceOdds = { win: {}, place: {}, exacta: {}, trifecta: {} };

  for (const race of records) {
    raceOdds.win = race.winOdds;
    raceOdds.place = race.placeOdds;
    raceOdds.exacta = race.exactaOdds;
    raceOdds.trifecta = race.trifectaOdds;

    const decision = BettingStrategy.decideBet(raceOdds, balance, config);
    if (!decision) {
      skipped += 1;
      continue;
    }

    const winner = race.finishOrder[0];
    const won = decision.horse === winner;
    const payout = won ? Math.round(decision.stake * decision.odds) : 0;

    balance = balance - decision.stake + payout;
    totalStaked += decision.stake;
    totalPayout += payout;

    if (won) {
      wins += 1;
    } else {
      losses += 1;
    }

    if (balance > peakBalance) {
      peakBalance = balance;
    }
    const drawdown = peakBalance - balance;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  const betsPlaced = wins + losses;
  const winRate = betsPlaced > 0 ? (wins / betsPlaced) * 100 : 0;
  const netProfit = balance - initialBalance;
  const roi = totalStaked > 0 ? (netProfit / totalStaked) * 100 : 0;

  return {
    name: `${config.strategy}[min=${config.minOddsThreshold},max=${config.maxOddsThreshold},stake=${config.stakePercentage}%]`,
    betsPlaced,
    wins,
    losses,
    skipped,
    winRate,
    totalStaked,
    totalPayout,
    netProfit,
    roi,
    finalBalance: balance,
    maxDrawdown
  };
}

function buildImprovedModels(): ProbabilityModelConfig[] {
  const models: ProbabilityModelConfig[] = [];

  const minOddsChoices = [1.5, 2.0, 2.5];
  const maxOddsChoices = [5.0, 7.5, 10.0];
  const minEdgeChoices = [0.00, 0.02, 0.05];
  const stakeChoices = [3, 5, 8, 10];
  const kellyChoices = [0.5, 1.0, 1.5];
  const maxStakeChoices = [8, 12, 15];

  for (const minOdds of minOddsChoices) {
    for (const maxOdds of maxOddsChoices) {
      if (maxOdds <= minOdds) continue;
      for (const minEdge of minEdgeChoices) {
        for (const stakePct of stakeChoices) {
          for (const kellyMultiplier of kellyChoices) {
            for (const maxStakePct of maxStakeChoices) {
              models.push({
                name: `adaptive-blend[min=${minOdds},max=${maxOdds},edge=${minEdge},stake=${stakePct}%,k=${kellyMultiplier},cap=${maxStakePct}%]`,
                minOdds,
                maxOdds,
                minEdge,
                horseWeight: 0.45,
                bucketWeight: 0.35,
                impliedWeight: 0.20,
                stakePct,
                kellyMultiplier,
                maxStakePct
              });

              models.push({
                name: `adaptive-odds-tilt[min=${minOdds},max=${maxOdds},edge=${minEdge},stake=${stakePct}%,k=${kellyMultiplier},cap=${maxStakePct}%]`,
                minOdds,
                maxOdds,
                minEdge,
                horseWeight: 0.25,
                bucketWeight: 0.25,
                impliedWeight: 0.50,
                stakePct,
                kellyMultiplier,
                maxStakePct
              });
            }
          }
        }
      }
    }
  }

  return models;
}

type CandidateConfig =
  | { kind: 'baseline'; name: string; config: StrategyConfig }
  | { kind: 'improved'; name: string; model: ProbabilityModelConfig };

function buildBaselineConfigs(): StrategyConfig[] {
  return [
    { strategy: 'conservative', minOddsThreshold: 1.5, maxOddsThreshold: 10.0, stakePercentage: 10 },
    { strategy: 'kelly', minOddsThreshold: 1.5, maxOddsThreshold: 20.0, stakePercentage: 10 },
    { strategy: 'greedy', minOddsThreshold: 2.0, maxOddsThreshold: 25.0, stakePercentage: 5 },
    { strategy: 'adaptive', minOddsThreshold: 1.5, maxOddsThreshold: 10.0, stakePercentage: 8 }
  ];
}

function buildCandidates(): CandidateConfig[] {
  const baselines = buildBaselineConfigs().map(config => ({
    kind: 'baseline' as const,
    name: `${config.strategy}[min=${config.minOddsThreshold},max=${config.maxOddsThreshold},stake=${config.stakePercentage}%]`,
    config
  }));

  const improved = buildImprovedModels().map(model => ({
    kind: 'improved' as const,
    name: model.name,
    model
  }));

  return [...baselines, ...improved];
}

function evaluateCandidate(
  records: RaceRecord[],
  candidate: CandidateConfig,
  initialBalance: number,
  seedStats?: RunningStats
): SimulationMetrics {
  if (candidate.kind === 'baseline') {
    return simulateBaseline(records, candidate.config, initialBalance);
  }

  return simulateImprovedModel(records, candidate.model, initialBalance, seedStats);
}

export interface WalkForwardFoldResult {
  fold: number;
  trainRaces: number;
  testRaces: number;
  selectedModel: string;
  trainROI: number;
  testROI: number;
  testNetProfit: number;
  testMaxDrawdown: number;
}

export interface WalkForwardReport {
  totalRaces: number;
  folds: number;
  foldSize: number;
  averageTestROI: number;
  medianTestROI: number;
  profitableFolds: number;
  foldResults: WalkForwardFoldResult[];
}

export function runWalkForwardValidation(
  folds = 5,
  initialBalance = 1000
): WalkForwardReport {
  const records = Logger.loadAllRaceRecords().filter(hasFullOdds);

  if (records.length < 20) {
    throw new Error('Walk-forward validation requires at least 20 races with full odds.');
  }

  const candidates = buildCandidates();
  const foldSize = Math.max(5, Math.floor(records.length / (folds + 1)));
  const foldResults: WalkForwardFoldResult[] = [];

  for (let fold = 1; fold <= folds; fold++) {
    const trainEnd = fold * foldSize;
    const testStart = trainEnd;
    const testEnd = Math.min(records.length, testStart + foldSize);

    if (testStart >= records.length || testEnd <= testStart) {
      break;
    }

    const trainSet = records.slice(0, trainEnd);
    const testSet = records.slice(testStart, testEnd);
    const seedStats = buildRunningStatsFromRecords(trainSet);

    const ranked = candidates
      .map(candidate => {
        const metrics = evaluateCandidate(trainSet, candidate, initialBalance);
        return { candidate, metrics };
      })
      .sort((a, b) => {
        if (b.metrics.roi !== a.metrics.roi) return b.metrics.roi - a.metrics.roi;
        if (b.metrics.finalBalance !== a.metrics.finalBalance) return b.metrics.finalBalance - a.metrics.finalBalance;
        return a.metrics.maxDrawdown - b.metrics.maxDrawdown;
      });

    const selected = ranked[0];
    const testMetrics = evaluateCandidate(
      testSet,
      selected.candidate,
      initialBalance,
      selected.candidate.kind === 'improved' ? seedStats : undefined
    );

    foldResults.push({
      fold,
      trainRaces: trainSet.length,
      testRaces: testSet.length,
      selectedModel: selected.candidate.name,
      trainROI: selected.metrics.roi,
      testROI: testMetrics.roi,
      testNetProfit: testMetrics.netProfit,
      testMaxDrawdown: testMetrics.maxDrawdown
    });
  }

  const testRois = foldResults.map(result => result.testROI).sort((a, b) => a - b);
  const averageTestROI = foldResults.length > 0
    ? foldResults.reduce((sum, result) => sum + result.testROI, 0) / foldResults.length
    : 0;
  const medianTestROI = testRois.length === 0
    ? 0
    : testRois.length % 2 === 1
      ? testRois[Math.floor(testRois.length / 2)]
      : (testRois[testRois.length / 2 - 1] + testRois[testRois.length / 2]) / 2;
  const profitableFolds = foldResults.filter(result => result.testROI > 0).length;

  return {
    totalRaces: records.length,
    folds: foldResults.length,
    foldSize,
    averageTestROI,
    medianTestROI,
    profitableFolds,
    foldResults
  };
}

export function runHistoricalOptimization(initialBalance = 1000): {
  totalRaces: number;
  candidateCount: number;
  best: SimulationMetrics;
  top10: SimulationMetrics[];
} {
  const records = Logger.loadAllRaceRecords().filter(hasFullOdds);

  if (records.length === 0) {
    throw new Error('No races with full odds found in SQLite logs.');
  }

  const baselineConfigs = buildBaselineConfigs();

  const baselineResults = baselineConfigs.map(cfg => simulateBaseline(records, cfg, initialBalance));
  const improvedModels = buildImprovedModels();
  const improvedResults = improvedModels.map(model => simulateImprovedModel(records, model, initialBalance));

  const all = [...baselineResults, ...improvedResults].sort((a, b) => {
    if (b.roi !== a.roi) return b.roi - a.roi;
    if (b.finalBalance !== a.finalBalance) return b.finalBalance - a.finalBalance;
    return a.maxDrawdown - b.maxDrawdown;
  });

  return {
    totalRaces: records.length,
    candidateCount: all.length,
    best: all[0],
    top10: all.slice(0, 10)
  };
}

if (require.main === module) {
  const result = runHistoricalOptimization(1000);
  const walkForward = runWalkForwardValidation(5, 1000);

  console.log(JSON.stringify({
    totalRaces: result.totalRaces,
    candidateCount: result.candidateCount,
    best: result.best,
    top10: result.top10,
    walkForward
  }, null, 2));
}
