export type StrategyContext = { market: string; mode: 'long' | 'short' };
export type StrategySignal = { market: string; side: 'long' | 'short'; size: number; leverage: number };
export interface Strategy { computeSignal(context: StrategyContext): Promise<StrategySignal> }
