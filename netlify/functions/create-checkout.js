// Creates a Stripe Checkout session for the customer's cart.
// Prices come from products.json (built from index.html), never from the browser.
// Netlify environment variables:
//   STRIPE_SECRET_KEY   required  sk_test_... while testing, sk_live_... when you go live
//   SHIPPING_GBP        optional  UK delivery charge, default 3.99
//   FREE_SHIPPING_OVER  optional  basket total for free delivery, default 200 (set 0 to turn off)
const products = require('./products.json');

const json = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const pence = (gbp) => Math.round(Number(gbp) * 100);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return json(500, { error: 'Payments are not set up yet.' });

  let items;
  try { items = JSON.parse(event.body || '{}').items; } catch (e) { return json(400, { error: 'Invalid cart.' }); }
  if (!Array.isArray(items) || !items.length || items.length > 60) return json(400, { error: 'Your cart is empty.' });

  const lines = [];
  let subtotal = 0;
  for (const it of items) {
    // match by title so a cart opened before a product update still charges the right item
    let p = products[Number(it && it.i)];
    if (it && it.t && (!p || p.title !== it.t)) p = products.find(x => x.title === it.t);
    const q = Math.floor(Number(it && it.q));
    if (!p || !(q >= 1 && q <= 20)) return json(400, { error: 'Something in your cart is no longer available.' });
    if (!p.inStock) return json(409, { error: p.title + ' is sold out.' });
    lines.push({ p, q });
    subtotal += p.price * q;
  }

  const site = process.env.URL || 'https://int-tcg.com';
  const ship = process.env.SHIPPING_GBP !== undefined ? Number(process.env.SHIPPING_GBP) : 3.99;
  const freeOver = process.env.FREE_SHIPPING_OVER !== undefined ? Number(process.env.FREE_SHIPPING_OVER) : 200;
  const shipPence = freeOver > 0 && subtotal >= freeOver ? 0 : pence(ship);

  const f = new URLSearchParams();
  f.append('mode', 'payment');
  f.append('currency', 'gbp');
  f.append('success_url', site + '/thanks.html?session_id={CHECKOUT_SESSION_ID}');
  f.append('cancel_url', site + '/?cancelled=1#shop');
  f.append('shipping_address_collection[allowed_countries][0]', 'GB');
  f.append('phone_number_collection[enabled]', 'true');
  f.append('locale', 'en-GB');
  f.append('custom_text[submit][message]', 'Every order is checked, packed with care and sent tracked.');
  f.append('custom_text[shipping_address][message]', 'We ship across the UK. Tracking is emailed as soon as your order is on its way.');
  f.append('billing_address_collection', 'auto');
  f.append('shipping_options[0][shipping_rate_data][type]', 'fixed_amount');
  f.append('shipping_options[0][shipping_rate_data][display_name]', shipPence === 0 ? 'Free UK delivery' : 'UK delivery');
  f.append('shipping_options[0][shipping_rate_data][fixed_amount][amount]', String(shipPence));
  f.append('shipping_options[0][shipping_rate_data][fixed_amount][currency]', 'gbp');
  lines.forEach(({ p, q }, n) => {
    const name = (p.preorder ? 'PRE-ORDER: ' : '') + p.title;
    f.append(`line_items[${n}][quantity]`, String(q));
    f.append(`line_items[${n}][price_data][currency]`, 'gbp');
    f.append(`line_items[${n}][price_data][unit_amount]`, String(pence(p.price)));
    f.append(`line_items[${n}][price_data][product_data][name]`, name.slice(0, 250));
    f.append(`line_items[${n}][price_data][product_data][metadata][site_index]`, String(p.i));
    // product photo on the Stripe page (served as a JPG through Netlify's image CDN)
    if (p.image && /^https:/.test(site)) {
      f.append(`line_items[${n}][price_data][product_data][images][0]`, site + '/.netlify/images?url=' + encodeURIComponent('/' + String(p.image).replace(/^\//, '')) + '&w=600&fm=jpg');
    }
  });
  f.append('metadata[source]', 'int-tcg.com');

  try {
    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: f.toString(),
    });
    const d = await r.json();
    if (!r.ok) { console.error('Stripe error', d && d.error); return json(502, { error: 'Checkout is unavailable right now.' }); }
    return json(200, { url: d.url });
  } catch (e) {
    console.error(e);
    return json(502, { error: 'Checkout is unavailable right now.' });
  }
};
