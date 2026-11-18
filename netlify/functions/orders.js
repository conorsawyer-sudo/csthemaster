// Live orders for int-tcg.com/admin/orders: paid Stripe checkouts, newest first.
// Only for people logged in to /admin with a GitHub account that can edit the shop.
const stock = require('../../lib/stock.js');
const REPO = process.env.GITHUB_REPO || 'conorsawyer-sudo/csthemaster';
const json = (status, body) => ({ statusCode: status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) });

async function stripe(path) {
  const r = await fetch('https://api.stripe.com/v1' + path, { headers: { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY } });
  const d = await r.json();
  if (!r.ok) throw new Error((d.error && d.error.message) || 'Stripe error');
  return d;
}

exports.handler = async (event) => {
  // Only people who can edit the shop on GitHub (the same login as /admin) can see orders.
  const token = (event.headers['x-github-token'] || event.headers['X-Github-Token'] || '').trim();
  if (!token) return json(401, { error: 'Log in to /admin first.' });
  const gh = await fetch('https://api.github.com/repos/' + REPO, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'int-tcg-orders' } });
  const repo = gh.ok ? await gh.json() : null;
  if (!repo || !repo.permissions || !repo.permissions.push) return json(401, { error: 'Your GitHub login does not have access to the shop. Log in to /admin again.' });
  if (!process.env.STRIPE_SECRET_KEY) return json(500, { error: 'STRIPE_SECRET_KEY is not set.' });

  try {
    const list = await stripe('/checkout/sessions?limit=50&status=complete&expand[]=data.line_items');
    const sessions = list.data.filter(s => s.payment_status === 'paid' || s.payment_status === 'no_payment_required');
    // fall back to fetching line items one by one if Stripe didn't include them
    await Promise.all(sessions.filter(s => !s.line_items).map(async s => { s.line_items = await stripe('/checkout/sessions/' + s.id + '/line_items?limit=50'); }));
    // count stock for any paid order the thank-you page didn't (customer closed the tab early)
    if (stock.tracking()) {
      try { const { store, st } = await stock.load(event); let ch = false; sessions.slice().reverse().forEach(x => { if (stock.apply(st, x)) ch = true; }); if (ch) await store.setJSON('state', st); } catch (e) { console.error('stock', e); }
    }
    const orders = sessions.map(s => {
      const ship = (s.collected_information && s.collected_information.shipping_details) || s.shipping_details || null;
      const cust = s.customer_details || {};
      const addr = (ship && ship.address) || cust.address || {};
      return {
        id: s.id,
        ref: (s.payment_intent || s.id).slice(-8).toUpperCase(),
        created: s.created,
        live: s.livemode,
        total: (s.amount_total || 0) / 100,
        shipping: ((s.total_details && s.total_details.amount_shipping) || 0) / 100,
        name: (ship && ship.name) || cust.name || '',
        email: cust.email || '',
        phone: cust.phone || '',
        address: [addr.line1, addr.line2, addr.city, addr.state, addr.postal_code, addr.country].filter(Boolean),
        items: ((s.line_items && s.line_items.data) || []).map(li => ({ name: li.description, qty: li.quantity, amount: (li.amount_total || 0) / 100 })),
        stripe: 'https://dashboard.stripe.com/' + (s.livemode ? '' : 'test/') + 'payments/' + (s.payment_intent || ''),
      };
    });
    return json(200, { orders, at: Date.now() });
  } catch (e) {
    console.error(e);
    return json(502, { error: e.message });
  }
};
