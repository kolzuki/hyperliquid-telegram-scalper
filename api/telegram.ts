export default async function handler(req, res) {
  var BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
  var WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  var DEFAULT_MARKETS = (process.env.DEFAULT_MARKETS || "BTC-PERP,ETH-PERP,SOL-PERP").split(",");
  var MOCK_MODE = (process.env.MOCK_MODE || "true").toLowerCase() === "true";
  var REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || "";
  var REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
  function isAuthorized() {
    var headers = req.headers || {};
    var rawHeader = headers["x-telegram-bot-api-secret-token"] || headers["X-Telegram-Bot-Api-Secret-Token"];
    var headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (typeof headerValue === "string" && WEBHOOK_SECRET && headerValue.trim() === WEBHOOK_SECRET.trim()) return true;
    var q = req.query || {};
    var secretParam = (Array.isArray(q.secret) ? q.secret[0] : q.secret) || (Array.isArray(q.token) ? q.token[0] : q.token) || (Array.isArray(q.s) ? q.s[0] : q.s);
    if (typeof secretParam === "string" && WEBHOOK_SECRET && secretParam.trim() === WEBHOOK_SECRET.trim()) return true;
    var body = req.body || {};
    var bodySecret = body.secret_token || body.secret || body.token;
    if (typeof bodySecret === "string" && WEBHOOK_SECRET && bodySecret.trim() === WEBHOOK_SECRET.trim()) return true;
    return false;
  }
  async function httpPost(url, bodyObj) {
    var resp = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(bodyObj) });
    if (!resp.ok) {
      var txt = "";
      try { txt = await resp.text(); } catch (_) {}
      console.error("Telegram API error:", resp.status, txt);
    }
  }

  // --- Optional mock persistence (Upstash REST) ---
  function hasRedis() { return !!(REDIS_URL && REDIS_TOKEN); }
  async function redisGet(key) {
    if (!hasRedis()) return null;
    try {
      var resp = await fetch(REDIS_URL + "/get/" + encodeURIComponent(key), { headers: { Authorization: "Bearer " + REDIS_TOKEN } });
      if (!resp.ok) return null;
      var data = await resp.json();
      return (data && data.result) || null;
    } catch (_) { return null; }
  }
  async function redisSet(key, value) {
    if (!hasRedis()) return false;
    try {
      var resp = await fetch(REDIS_URL + "/set/" + encodeURIComponent(key) + "/" + encodeURIComponent(value), { headers: { Authorization: "Bearer " + REDIS_TOKEN } });
      return resp.ok;
    } catch (_) { return false; }
  }
  async function redisDel(key) {
    if (!hasRedis()) return false;
    try {
      var resp = await fetch(REDIS_URL + "/del/" + encodeURIComponent(key), { headers: { Authorization: "Bearer " + REDIS_TOKEN } });
      return resp.ok;
    } catch (_) { return false; }
  }
  function positionsKey(chatId) { return "positions:" + String(chatId); }
  async function loadPositions(chatId) {
    var raw = await redisGet(positionsKey(chatId));
    if (!raw) return [];
    try { return JSON.parse(raw); } catch (_) { return []; }
  }
  async function savePositions(chatId, positions) {
    await redisSet(positionsKey(chatId), JSON.stringify(positions));
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
          var openText = `Opened ${order.side.toUpperCase()} on ${order.market} (mock)\nsize=${order.size}, lev=${order.leverage}\nPnL tracking: simulated`;
          try { await editMessageText(
            BOT_TOKEN,
            chatId,
            messageId,
            openText,
            buildMainMenu(DEFAULT_MARKETS)
          ); } catch (e) { console.error(e); }
          try { await sendMessage(BOT_TOKEN, chatId, openText, buildMainMenu(DEFAULT_MARKETS)); } catch (e2) { console.error(e2); }
          // persist mock position
          if (hasRedis()) {
            try {
              var positions = await loadPositions(chatId);
              positions.push({ market: market, side: signal.side, size: signal.size, leverage: signal.leverage, entryPrice: 0 });
              await savePositions(chatId, positions);
            } catch (eP) { console.error(eP); }
          }
        } else {
          var liveText = "Live mode not enabled. Set MOCK_MODE=false only if you wired real keys.";
          try { await editMessageText(BOT_TOKEN, chatId, messageId, liveText, buildMainMenu(DEFAULT_MARKETS)); } catch (e3) { console.error(e3); }
          try { await sendMessage(BOT_TOKEN, chatId, liveText, buildMainMenu(DEFAULT_MARKETS)); } catch (e4) { console.error(e4); }
        }
        return res.status(200).send("ok");
      }
      if (data.indexOf("close:") === 0) {
        var scope = data.split(":")[1];
        var result = await mockClosePosition(scope);
        var closeText = "Closed positions: " + (result.closed.join(", ") || "none") + " (mock)";
        try { await editMessageText(BOT_TOKEN, chatId, messageId, closeText, buildMainMenu(DEFAULT_MARKETS)); } catch (e5) { console.error(e5); }
        try { await sendMessage(BOT_TOKEN, chatId, closeText, buildMainMenu(DEFAULT_MARKETS)); } catch (e6) { console.error(e6); }
        // clear persisted positions for simplicity
        if (hasRedis()) {
          try { await redisDel(positionsKey(chatId)); } catch (eD) { console.error(eD); }
        }
        return res.status(200).send("ok");
      }
      if (data === "status") {
        var count = 0;
        if (hasRedis()) {
          try { var pos = await loadPositions(chatId); count = Array.isArray(pos) ? pos.length : 0; } catch (_) {}
        }
        var statusText = `Status (mock)\nPositions: ${count}\nPNL: 0.00\nMode: ${MOCK_MODE ? "MOCK" : "LIVE"}`;
        try { await editMessageText(
          BOT_TOKEN,
          chatId,
          messageId,
          statusText,
          buildMainMenu(DEFAULT_MARKETS)
        ); } catch (e7) { console.error(e7); }
        try { await sendMessage(BOT_TOKEN, chatId, statusText, buildMainMenu(DEFAULT_MARKETS)); } catch (e8) { console.error(e8); }
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
