# Hyperliquid Telegram Scalper (Vercel)

Serverless Telegram bot on Vercel with a simple PVP-style inline keyboard, mock Hyperliquid client, and pluggable strategy.

## Deploy

1) Rotate your Telegram token in BotFather.
2) Import this repo into Vercel (New Project → Import from Git).
3) In Vercel Project → Settings → Environment Variables, add:
   - TELEGRAM_BOT_TOKEN = <your rotated token>
   - TELEGRAM_WEBHOOK_SECRET = <random string>
   - DEFAULT_MARKETS = BTC-PERP,ETH-PERP,SOL-PERP
   - MOCK_MODE = true
4) Deploy on Vercel.

## Set the Telegram webhook

After deploy, your function URL will look like:
https://<your-project>.vercel.app/api/telegram

Set the webhook with a secret token header handled by the function:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<your-project>.vercel.app/api/telegram",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
  }'
```

Verify:
```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

## Usage

- Open your bot in Telegram and send `/start`.
- Use inline buttons to Open Long/Short, Close All, or see Status.
- Currently runs in MOCK mode (no real orders). To go live, implement real Hyperliquid API calls in `src/exchange/hyperliquid.ts` and set `MOCK_MODE=false`.

## Notes

- Vercel Free is stateless; this mock does not persist positions.
- Strategy: implement your logic in `src/strategy/naive.ts` or replace via the interface.
