// Public: live stock numbers for counted products, used by the shop and product pages.
const { load, leftMap, tracking } = require('../../lib/stock.js');
exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=20' };
  if (!tracking()) return { statusCode: 200, headers, body: JSON.stringify({ tracking: false, left: {} }) };
  try {
    const { st } = await load(event);
    return { statusCode: 200, headers, body: JSON.stringify({ tracking: true, left: leftMap(st) }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 200, headers, body: JSON.stringify({ tracking: false, left: {} }) };
  }
};
