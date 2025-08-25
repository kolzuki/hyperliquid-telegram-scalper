export function buildMainMenu(markets: string[]) {
  const rows: Array<Array<{ text: string; callback_data: string }>> = [];
  for (const market of markets) {
    rows.push([
      { text: `Open ${market} Long`, callback_data: `open:${market}:long` },
      { text: `Open ${market} Short`, callback_data: `open:${market}:short` },
    ]);
  }
  rows.push([
    { text: 'Close All', callback_data: 'close:all' },
    { text: 'Status', callback_data: 'status' },
  ]);
  rows.push([{ text: 'Main Menu', callback_data: 'menu:main' }]);
  return { inline_keyboard: rows };
}
