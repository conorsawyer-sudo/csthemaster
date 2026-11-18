// Counts stock down after each paid order (only while Stock counting is switched on in /admin).
// Stripe sends "checkout.session.completed" here; we take one off each product's stock in
// data/products.json on GitHub, which redeploys the site with the new numbers.
// Netlify environment variables:
//   STRIPE_WEBHOOK_SECRET  whsec_... from Stripe > Developers > Webhooks (this endpoint)
//   GITHUB_TOKEN           fine-grained token with Contents: read and write on the repo
//   GITHUB_REPO            optional, default conorsawyer-sudo/csthemaster
const crypto = require('crypto');

const REPO = process.env.GITHUB_REPO || 'conorsawyer-sudo/csthemaster';
const reply = (status, msg) => ({ statusCode: status, headers: { 'Content-Type': 'text/plain' }, body: msg });

function verify(payload, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map(kv => kv.split('=')).filter(x => x.length === 2).map(([k, v]) => [k, v]));
  const sigs = header.split(',').filter(x => x.startsWith('v1=')).map(x => x.slice(3));
  if (!parts.t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 600) return false;
  const expected = crypto.createHmac('sha256', secret).update(parts.t + '.' + payload, 'utf8').digest('hex');
  return sigs.some(s => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

async function gh(pathname, opts = {}) {
  const r = await fetch('https://api.github.com/repos/' + REPO + pathname, {
    ...opts,
    headers: { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'int-tcg-stock', ...(opts.headers || {}) },
  });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, d };
}
const read = async (file) => {
  const r = await gh('/contents/' + file + '?ref=main');
  if (!r.ok) throw new Error('GitHub read ' + file + ' ' + r.status);
  return { sha: r.d.sha, json: JSON.parse(Buffer.from(r.d.content, 'base64').toString('utf8')) };
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, 'POST only');
  const payload = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  if (!verify(payload, sig, process.env.STRIPE_WEBHOOK_SECRET)) return reply(400, 'Bad signature');

  const evt = JSON.parse(payload);
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(evt.type)) return reply(200, 'Ignored');
  const s = evt.data.object;
  if (s.payment_status !== 'paid') return reply(200, 'Not paid yet');
  if (!process.env.GITHUB_TOKEN) return reply(200, 'No GITHUB_TOKEN set, stock not counted');

  // what was bought: metadata l0, l1, ... = "title|qty"
  const bought = {};
  Object.keys(s.metadata || {}).filter(k => /^l\d+$/.test(k)).forEach(k => {
    const v = s.metadata[k], cut = v.lastIndexOf('|');
    const t = v.slice(0, cut).trim(), q = parseInt(v.slice(cut + 1), 10) || 0;
    if (t && q > 0) bought[t] = (bought[t] || 0) + q;
  });
  if (!Object.keys(bought).length) return reply(200, 'No items');

  try {
    const settings = await read('data/settings.json').catch(() => ({ json: {} }));
    if (settings.json.stock_tracking !== true) return reply(200, 'Stock counting is off');

    // Stripe can send the same event twice: skip if this order was already counted
    const log = await gh('/commits?path=data/products.json&per_page=30');
    if (log.ok && log.d.some(c => (c.commit.message || '').includes(s.id))) return reply(200, 'Already counted');

    for (let attempt = 0; attempt < 3; attempt++) {
      const { sha, json } = await read('data/products.json');
      const changed = [];
      (json.products || []).forEach(p => {
        const t = String(p.title || '').trim();
        if (bought[t] && p.stock !== undefined && p.stock !== null && p.stock !== '' && !isNaN(Number(p.stock))) {
          const before = Number(p.stock);
          p.stock = Math.max(0, before - bought[t]);
          changed.push(t + ' ' + before + '→' + p.stock);
        }
      });
      if (!changed.length) return reply(200, 'No counted products in this order');
      const body = JSON.stringify(json, null, 2) + '\n';
      const put = await gh('/contents/data/products.json', {
        method: 'PUT',
        body: JSON.stringify({ message: 'Stock: order ' + s.id + '\n\n' + changed.join('\n'), content: Buffer.from(body, 'utf8').toString('base64'), sha, branch: 'main' }),
      });
      if (put.ok) return reply(200, 'Stock updated: ' + changed.join(', '));
      if (put.status !== 409 && put.status !== 422) throw new Error('GitHub write ' + put.status);
    }
    throw new Error('GitHub kept changing, try again');
  } catch (e) {
    console.error(e);
    return reply(500, 'Stock update failed'); // Stripe retries automatically
  }
};
