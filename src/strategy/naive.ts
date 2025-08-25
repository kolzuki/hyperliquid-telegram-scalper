import { Strategy, StrategyContext, StrategySignal } from './interface';

export class NaiveStrategy implements Strategy {
  async computeSignal(context: StrategyContext): Promise<StrategySignal> {
    const size = 0.01;
    const leverage = 3;
    return { market: context.market, side: context.mode, size, leverage };
  }
}
