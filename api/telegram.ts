export default async function handler(req, res) {
  var BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
  var WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  var DEFAULT_MARKETS = (process.env.DEFAULT_MARKETS || "BTC-PERP,ETH-PERP,SOL-PERP").split(",");
  var MOCK_MODE = (process.env.MOCK_MODE || "true").toLowerCase() === "true";
  function isAuthorized() {
    var header = req.headers["x-telegram-bot-api-secret-token"];
    if (typeof header === "string" && WEBHOOK_SECRET && header === WEBHOOK_SECRET) return true;
    var q = req.query || {};
    if (typeof q.secret === "string" && WEBHOOK_SECRET && q.secret === WEBHOOK_SECRET) return true;
    return false;
  }
  async function httpPost(url, bodyObj) {
    await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(bodyObj) });
  }
  async function sendMessage(botToken, chatId, text, replyMarkup) {
    var url = "https://api.telegram.org/bot" + botToken + "/sendMessage";
    var body = { chat_id: chatId, text: text, parse_mode: "Markdown" };
    if (replyMarkup) body.reply_markup = replyMarkup;
    await httpPost(url, body);
  }
  async function editMessageText(botToken, chatId, messageId, text, replyMarkup) {
    var url = "https://api.telegram.org/bot" + botToken + "/editMessageText";
    var body = { chat_id: chatId, message_id: messageId, text: text, parse_mode: "Markdown" };
    if (replyMarkup) body.reply_markup = replyMarkup;
    await httpPost(url, body);
  }
  async function answerCallbackQuery(botToken, callbackQueryId) {
    var url = "https://api.telegram.org/bot" + botToken + "/answerCallbackQuery";
    await httpPost(url, { callback_query_id: callbackQueryId });
  }
  function buildMainMenu(markets) {
    var rows = [];
    for (var i = 0; i < markets.length; i++) {
      var m = markets[i].trim();
      if (!m) continue;
      rows.push([
        { text: "Open " + m + " Long", callback_data: "open:" + m + ":long" },
        { text: "Open " + m + " Short", callback_data: "open:" + m + ":short" }
      ]);
    }
    rows.push([ { text: "Close All", callback_data: "close:all" }, { text: "Status", callback_data: "status" } ]);
    rows.push([ { text: "Main Menu", callback_data: "menu:main" } ]);
    return { inline_keyboard: rows };
  }
  async function mockOpenPosition(input) {
    return { market: input.market, side: input.side, size: input.size, leverage: input.leverage, orderId: ("mock_" + input.market + "_" + Date.now()) };
  }
  async function mockClosePosition(scope) {
    return { closed: scope === "all" ? ["BTC-PERP","ETH-PERP","SOL-PERP"] : [scope] };
  }
  function computeNaiveSignal(market, mode) {
    return { market: market, side: mode, size: 0.01, leverage: 3 };
  }
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");
  if (!BOT_TOKEN) return res.status(500).send("Missing TELEGRAM_BOT_TOKEN");
  if (!WEBHOOK_SECRET) return res.status(500).send("Missing TELEGRAM_WEBHOOK_SECRET");
  if (!isAuthorized()) return res.status(401).send("Unauthorized");
  var update = req.body || {};
  try {
    if (update.callback_query) {
      var cq = update.callback_query;
      var chatId = cq && cq.message && cq.message.chat && cq.message.chat.id;
      var messageId = cq && cq.message && cq.message.message_id;
      var data = cq.data || "";
      await answerCallbackQuery(BOT_TOKEN, cq.id);
      if (!chatId || !messageId) return res.status(200).send("ok");
      if (data === "menu:main") {
        await editMessageText(BOT_TOKEN, chatId, messageId, "Choose an action:", buildMainMenu(DEFAULT_MARKETS));
        return res.status(200).send("ok");
      }
      if (data.indexOf("open:") === 0) {
        var parts = data.split(":");
        var market = parts[1];
        var side = parts[2];
        var signal = computeNaiveSignal(market, side);
        if (MOCK_MODE) {
          var order = await mockOpenPosition({ market: market, side: signal.side, size: signal.size, leverage: signal.leverage });
          await editMessageText(BOT_TOKEN, chatId, messageId, "Opened " + (order.side.toUpperCase()) + " on " + order.market + " (mock)
size=" + order.size + ", lev=" + order.leverage + "
PnL tracking: simulated", buildMainMenu(DEFAULT_MARKETS));
        } else {
          await editMessageText(BOT_TOKEN, chatId, messageId, "Live mode not enabled. Set MOCK_MODE=false only if you wired real keys.", buildMainMenu(DEFAULT_MARKETS));
        }
        return res.status(200).send("ok");
      }
      if (data.indexOf("close:") === 0) {
        var scope = data.split(":")[1];
        var result = await mockClosePosition(scope);
        await editMessageText(BOT_TOKEN, chatId, messageId, "Closed positions: " + (result.closed.join(", ") || "none") + " (mock)", buildMainMenu(DEFAULT_MARKETS));
        return res.status(200).send("ok");
      }
      if (data === "status") {
        await editMessageText(BOT_TOKEN, chatId, messageId, "Status (mock)
Positions: 0
PNL: 0.00
Mode: " + (MOCK_MODE ? "MOCK" : "LIVE"), buildMainMenu(DEFAULT_MARKETS));
        return res.status(200).send("ok");
      }
      return res.status(200).send("ok");
    }
    if (update.message) {
      var msg = update.message;
      var chatId2 = msg.chat && msg.chat.id;
      if (msg.text === "/start") {
        await sendMessage(BOT_TOKEN, chatId2, "Welcome! Choose an action:", buildMainMenu(DEFAULT_MARKETS));
        return res.status(200).send("ok");
      }
      await sendMessage(BOT_TOKEN, chatId2, "Use /start to open the menu.");
      return res.status(200).send("ok");
    }
    return res.status(200).send("ok");
  } catch (e) {
    console.error(e);
    return res.status(200).send("ok");
  }
}
