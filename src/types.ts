export interface RaceOdds {
  win: Record<string, number>;
  place: Record<string, number>;
  exacta: Record<string, Record<string, number>>;
  trifecta: Record<string, Record<string, Record<string, number>>>;
}

export interface NextRace {
  race_id: number;
  odds: RaceOdds;
}

export interface RaceResult {
  success: boolean;
  data: {
    response_type: string;
    response_code: string;
    result: 'win' | 'loss';
    finish_order: number[];
    payout: number;
    new_balance: number;
    next_race: NextRace;
  };
}

export interface BetConfig {
  action: string;
  nonce: string;
  race_id: number;
  bet_type: 'win' | 'place' | 'exacta' | 'trifecta';
  picks: string | number | number[];
  stake: number;
}

export interface BetResult {
  raceId: number;
  horsePicked: number;
  stakeAmount: number;
  betType: 'win' | 'place';
  odds: number;
  result: 'win' | 'loss';
  payout: number;
  finishOrder: number[];
  newBalance: number;
}

export interface StrategyConfig {
  minOddsThreshold: number;
  maxOddsThreshold: number;
  stakePercentage: number;
  strategy: 'greedy' | 'kelly' | 'conservative';
}

export interface AutoBettingConfig {
  enabled: boolean;
  indefinite: boolean;
  strategySwitchDelta: number;
  recentWindowSize: number;
}

export interface SessionConfig {
  cookies: string;
  nonce: string;
  raceId?: number;
  maxRaces: number;
  raceDelayMs?: number;
  dryRun?: boolean;
  strategyConfig: StrategyConfig;
  autoBetting?: AutoBettingConfig;
}

export interface Stats {
  totalRaces: number;
  totalWins: number;
  totalLosses: number;
  totalStaked: number;
  totalPayout: number;
  netProfit: number;
  roi: number;
  startingBalance: number;
  currentBalance: number;
  bets: BetResult[];
}
