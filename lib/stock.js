// Live stock counts, kept in Netlify Blobs (built into Netlify, no keys needed).
// The count you type in /admin is the starting number. Each paid order takes its items off.
// Change the number in /admin and counting starts again from the new number.
const { getStore, connectLambda } = require('@netlify/blobs');
const products = require('../netlify/functions/products.json');

const counted = () => products.filter(p => typeof p.stock === 'number');

async function load(event) {
  connectLambda(event);
  const store = getStore('stock');
  const st = (await store.get('state', { type: 'json' })) || { items: {}, done: [] };
  let changed = false;
  const now = Math.floor(Date.now() / 1000);
  counted().forEach(p => {
    const it = st.items[p.title];
    if (!it || it.base !== p.stock) { st.items[p.title] = { base: p.stock, left: p.stock, since: now }; changed = true; }
  });
  if (changed) await store.setJSON('state', st);
  return { store, st };
}

// live numbers for every counted product: { title: left }
function leftMap(st) {
  const out = {};
  counted().forEach(p => { const it = st.items[p.title]; out[p.title] = it ? Math.max(0, it.left) : p.stock; });
  return out;
}

// take a paid Stripe checkout session's items off stock (once per session)
function apply(st, s) {
  if (!s || st.done.includes(s.id)) return false;
  if (s.payment_status !== 'paid' && s.payment_status !== 'no_payment_required') return false;
  let hit = false;
  Object.keys(s.metadata || {}).filter(k => /^l\d+$/.test(k)).forEach(k => {
    const v = s.metadata[k], cut = v.lastIndexOf('|');
    const t = v.slice(0, cut).trim(), q = parseInt(v.slice(cut + 1), 10) || 0;
    const it = st.items[t];
    if (it && q > 0 && s.created >= it.since) { it.left = Math.max(0, it.left - q); hit = true; }
  });
  st.done.push(s.id);
  if (st.done.length > 2000) st.done = st.done.slice(-2000);
  return true;
}

module.exports = { load, leftMap, apply, tracking: () => counted().length > 0 };
