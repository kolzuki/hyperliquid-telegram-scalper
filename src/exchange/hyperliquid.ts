type OpenPositionInput = { market: string; side: 'long' | 'short'; size: number; leverage: number };
type ClosePositionInput = { market: string | 'all' };
type Position = { market: string; side: 'long' | 'short'; size: number; leverage: number; entryPrice: number };
type Status = { positions: Position[]; unrealizedPnl: number };

export class MockHyperliquidClient {
  async openPosition(input: OpenPositionInput) {
    return { ...input, orderId: `mock_${input.market}_${Date.now()}` };
  }
  async closePosition(input: ClosePositionInput) {
    return { closed: input.market === 'all' ? ['BTC-PERP', 'ETH-PERP', 'SOL-PERP'] : [input.market as string] };
  }
  async getStatus(): Promise<Status> {
    return { positions: [], unrealizedPnl: 0 };
  }
}
