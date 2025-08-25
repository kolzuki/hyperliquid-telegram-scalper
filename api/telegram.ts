export default async function handler(req, res) {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
  const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';
  const DEFAULT_MARKETS = (process.env.DEFAULT_MARKETS || 'BTC-PERP,ETH-PERP,SOL-PERP').split(',').map(s => s.trim());
  const MOCK_MODE = (process.env.MOCK_MODE || 'true').toLowerCase() === 'true';

  function isAuthorized() {
    const header = req.headers['x-telegram-bot-api-secret-token'];
    if (typeof header === 'string' && WEBHOOK_SECRET && header === WEBHOOK_SECRET) return true;
    const q = req.query || {};
    if (typeof q.secret === 'string' && WEBHOOK_SECRET && q.secret === WEBHOOK_SECRET) return true;
    return false;
  }

  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  if (!BOT_TOKEN) return res.status(500).send('Missing TELEGRAM_BOT_TOKEN');
  if (!WEBHOOK_SECRET) return res.status(500).send('Missing TELEGRAM_WEBHOOK_SECRET');
  if (!isAuthorized()) return res.status(401).send('Unauthorized');

  const update = req.body;
  try {
    if (update && update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat?.id;
      const messageId = cq.message?.message_id;
      const data = cq.data || '';
      const api = await import('../src/telegram/api');
      const { buildMainMenu } = await import('../src/telegram/menu');
      const { MockHyperliquidClient } = await import('../src/exchange/hyperliquid');
      const { NaiveStrategy } = await import('../src/strategy/naive');

      await api.answerCallbackQuery(BOT_TOKEN, cq.id);
      if (!chatId || !messageId) return res.status(200).send('ok');

      const exchange = new MockHyperliquidClient();
      const strategy = new NaiveStrategy();

      if (data === 'menu:main') {
        await api.editMessageText(BOT_TOKEN, chatId, messageId, 'Choose an action:', buildMainMenu(DEFAULT_MARKETS));
        return res.status(200).send('ok');
      }
      if (data.startsWith('open:')) {
        const [, market, side] = data.split(':');
        const signal = await strategy.computeSignal({ market, mode: side });
        if (MOCK_MODE) {
          const order = await exchange.openPosition({ market, side: signal.side, size: signal.size, leverage: signal.leverage });
          await api.editMessageText(
            BOT_TOKEN,
            chatId,
            messageId,
            `Opened ${order.side.toUpperCase()} on ${order.market} (mock)\nsize=${order.size}, lev=${order.leverage}\nPnL tracking: simulated`,
            buildMainMenu(DEFAULT_MARKETS)
          );
        } else {
          await api.editMessageText(BOT_TOKEN, chatId, messageId, 'Live mode not enabled. Set MOCK_MODE=false only if you wired real keys.', buildMainMenu(DEFAULT_MARKETS));
        }
        return res.status(200).send('ok');
      }
      if (data.startsWith('close:')) {
        const [, scope] = data.split(':');
        const result = await exchange.closePosition({ market: scope });
        await api.editMessageText(BOT_TOKEN, chatId, messageId, `Closed positions: ${result.closed.join(', ') || 'none'} (mock)`, buildMainMenu(DEFAULT_MARKETS));
        return res.status(200).send('ok');
      }
      if (data === 'status') {
        const status = await exchange.getStatus();
        await api.editMessageText(
          BOT_TOKEN,
          chatId,
          messageId,
          `Status (mock)\nPositions: ${status.positions.length}\nPNL: ${status.unrealizedPnl.toFixed(2)}\nMode: ${MOCK_MODE ? 'MOCK' : 'LIVE'}`,
          buildMainMenu(DEFAULT_MARKETS)
        );
        return res.status(200).send('ok');
      }
      return res.status(200).send('ok');
    }

    if (update && update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const api = await import('../src/telegram/api');
      const { buildMainMenu } = await import('../src/telegram/menu');

      if (msg.text === '/start') {
        await api.sendMessage(BOT_TOKEN, chatId, 'Welcome! Choose an action:', buildMainMenu(DEFAULT_MARKETS));
        return res.status(200).send('ok');
      }
      await api.sendMessage(BOT_TOKEN, chatId, 'Use /start to open the menu.');
      return res.status(200).send('ok');
    }

    return res.status(200).send('ok');
  } catch (e) {
    console.error(e);
    return res.status(200).send('ok');
  }
}
