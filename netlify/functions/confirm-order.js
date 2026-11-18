// Called from the thank-you page: checks the payment with Stripe and counts the stock down once.
const { load, apply, tracking } = require('../../lib/stock.js');
const json = (status, body) => ({ statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
exports.handler = async (event) => {
  const id = (event.queryStringParameters || {}).session_id || '';
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return json(400, { ok: false });
  if (!tracking() || !process.env.STRIPE_SECRET_KEY) return json(200, { ok: true, counted: false });
  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions/' + id, { headers: { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY } });
    const s = await r.json();
    if (!r.ok) return json(404, { ok: false });
    const { store, st } = await load(event);
    if (apply(st, s)) await store.setJSON('state', st);
    return json(200, { ok: true, counted: true });
  } catch (e) {
    console.error(e);
    return json(500, { ok: false });
  }
};
