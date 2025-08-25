type InlineKeyboardMarkup = {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
};

export async function sendMessage(
  botToken: string,
  chatId: number,
  text: string,
  replyMarkup?: InlineKeyboardMarkup
) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body: any = { chat_id: chatId, text, parse_mode: 'Markdown' };
  if (replyMarkup) (body as any).reply_markup = replyMarkup;
  await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

export async function editMessageText(
  botToken: string,
  chatId: number,
  messageId: number,
  text: string,
  replyMarkup?: InlineKeyboardMarkup
) {
  const url = `https://api.telegram.org/bot${botToken}/editMessageText`;
  const body: any = { chat_id: chatId, message_id: messageId, text, parse_mode: 'Markdown' };
  if (replyMarkup) (body as any).reply_markup = replyMarkup;
  await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

export async function answerCallbackQuery(botToken: string, callbackQueryId: string) {
  const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
  await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ callback_query_id: callbackQueryId }) });
}
