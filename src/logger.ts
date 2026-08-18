import * as fs from 'fs';
import * as path from 'path';
import { BetResult } from './types';

export interface LogEntry {
  timestamp: string;
  race: number;
  horse: number;
  odds: number;
  stake: number;
  result: 'win' | 'loss';
  payout: number;
  balance: number;
  strategy: string;
}

export class Logger {
  private logDir: string;
  private logFile: string;
  private sessionId: string;

  constructor() {
    this.sessionId = new Date().toISOString().replace(/[:.]/g, '-');
    this.logDir = path.join(process.cwd(), '.betting-logs');
    this.logFile = path.join(this.logDir, `session-${this.sessionId}.json`);

    // Create logs directory if it doesn't exist
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // Initialize log file
    fs.writeFileSync(this.logFile, JSON.stringify([], null, 2));
  }

  logBet(bet: BetResult, strategy: string): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      race: bet.raceId,
      horse: bet.horsePicked,
      odds: bet.odds,
      stake: bet.stakeAmount,
      result: bet.result,
      payout: bet.payout,
      balance: bet.newBalance,
      strategy
    };

    try {
      const logs = JSON.parse(fs.readFileSync(this.logFile, 'utf-8'));
      logs.push(entry);
      fs.writeFileSync(this.logFile, JSON.stringify(logs, null, 2));
    } catch (error) {
      console.error('Error writing log:', error);
    }
  }

  getLogFile(): string {
    return this.logFile;
  }

  getAllLogs(): LogEntry[] {
    try {
      return JSON.parse(fs.readFileSync(this.logFile, 'utf-8'));
    } catch {
      return [];
    }
  }

  /**
   * Get all log files from previous sessions
   */
  static getAllSessions(): string[] {
    const logDir = path.join(process.cwd(), '.betting-logs');
    if (!fs.existsSync(logDir)) {
      return [];
    }
    return fs
      .readdirSync(logDir)
      .filter(f => f.startsWith('session-') && f.endsWith('.json'))
      .map(f => path.join(logDir, f));
  }

  /**
   * Load all logs from all sessions
   */
  static loadAllHistoricalLogs(): LogEntry[] {
    const sessions = Logger.getAllSessions();
    const allLogs: LogEntry[] = [];

    for (const session of sessions) {
      try {
        const logs = JSON.parse(fs.readFileSync(session, 'utf-8'));
        allLogs.push(...logs);
      } catch (error) {
        console.error(`Error reading session ${session}:`, error);
      }
    }

    return allLogs;
  }
}
