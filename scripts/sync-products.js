// Runs on every Netlify deploy (see netlify.toml).
// Source of truth: data/products.json (edited through int-tcg.com/admin).
// 1) writes the product list into index.html (var P, var IMG, var SLUG)
// 2) writes netlify/functions/products.json so checkout charges the same prices
// 3) builds one page per product at /products/<name> (for Google Ads and search)
// 4) rebuilds sitemap.xml and a Google Merchant Center feed at /feed.xml
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const SITE = 'https://int-tcg.com';
const CATS = ['s', 'p', 'c', 'g', 'b', 'm', 'a'];
const CAT_NAME = { s: 'Sealed box', p: 'Booster pack', c: 'Single card', g: 'Graded card', b: 'Bundle', m: 'Mystery pack', a: 'Accessory' };
const CAT_PLURAL = { s: 'Sealed boxes & ETBs', p: 'Booster packs', c: 'Singles', g: 'Graded cards', b: 'Bundles & tins', m: 'Mystery packs', a: 'Accessories' };
const SHIP = process.env.SHIPPING_GBP !== undefined ? Number(process.env.SHIPPING_GBP) : 3.99;
const FREE = process.env.FREE_SHIPPING_OVER !== undefined ? Number(process.env.FREE_SHIPPING_OVER) : 200;

const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'products.json'), 'utf8'));
const list = (data.products || []).filter(p => p && p.title);
list.forEach((p) => {
  if (!(Number(p.price) > 0)) throw new Error('Product "' + p.title + '" needs a price above 0');
  if (CATS.indexOf(p.category) < 0) throw new Error('Product "' + p.title + '" has an unknown category: ' + p.category);
});

// sourced-to-order lines: 3-5 working days to process, delivered within 7 days of purchase
const SLOW = list.map(p => p.dispatch === 'sourced');
const P = list.map(p => [String(p.title).trim(), Math.round(Number(p.price) * 100) / 100, p.in_stock === false ? 0 : 1, p.category, p.japanese ? 1 : 0, p.preorder ? 1 : 0]);
const IMG = {};
list.forEach((p, i) => { if (p.image) IMG[i] = String(p.image).replace(/^\//, ''); });

// URL names: lower case, accents removed, words joined by dashes. Stays the same as long as the title does.
function slugify(t) {
  return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90).replace(/-+$/, '') || 'product';
}
const used = {};
const SLUG = P.map(p => { let s = slugify(p[0]), n = s, k = 2; while (used[n]) n = s + '-' + k++; used[n] = 1; return n; });

// ---- 1) index.html ----
const file = path.join(root, 'index.html');
let html = fs.readFileSync(file, 'utf8');
const pRe = /var P = \[[\s\S]*?\n\s*\];/;
const iRe = /var IMG = \{[\s\S]*?\};/;
const sRe = /var SLUG = \[[^\]]*\];/;
if (!pRe.test(html) || !iRe.test(html) || !sRe.test(html)) throw new Error('Could not find the product list in index.html');
html = html.replace(pRe, () => 'var P = [\n' + P.map(r => '    ' + JSON.stringify(r)).join(',\n') + '\n  ];');
html = html.replace(iRe, () => 'var IMG = ' + JSON.stringify(IMG, null, 4).replace(/\n}/, '\n  }') + ';');
html = html.replace(sRe, () => 'var SLUG = ' + JSON.stringify(SLUG) + ';');
fs.writeFileSync(file, html);

// ---- 2) checkout price list ----
const out = P.map((p, i) => ({ i, title: p[0], price: p[1], inStock: !!p[2], preorder: !!p[5], image: IMG[i] || null }));
fs.writeFileSync(path.join(root, 'netlify', 'functions', 'products.json'), JSON.stringify(out, null, 1));

// ---- 3) product pages ----
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = n => '£' + Number(n).toFixed(2);
const abs = i => IMG[i] ? SITE + '/' + encodeURI(IMG[i]) : SITE + '/og-image.png';
const cdn = (i, w) => '/.netlify/images?url=' + encodeURIComponent('/' + IMG[i]) + '&w=' + w + '&fm=webp';

function lang(p) { return p[4] || /Japanese/i.test(p[0]) ? 'Japanese' : /English/i.test(p[0]) ? 'English' : ''; }
function describe(i) {
  const src = list[i], p = P[i];
  if (src.description && String(src.description).trim()) return String(src.description).trim();
  const l = lang(p), what = CAT_NAME[p[3]].toLowerCase();
  const bits = [];
  if (p[3] === 'c' || p[3] === 'g') bits.push(`${p[0]}. A genuine${l ? ' ' + l : ''} Pokémon TCG ${what}${/Near Mint/i.test(p[0]) ? ' in near mint condition' : ''}, checked by hand, sleeved and toploaded for posting.`);
  else if (p[3] === 'a') bits.push(`${p[0]}. Keep your Pokémon cards protected.`);
  else bits.push(`${p[0]}. Genuine${l ? ' ' + l : ''} Pokémon TCG product, ${p[3] === 'm' ? 'packed by us' : 'factory sealed'}${SLOW[i] ? '.' : ' and stored in our UK stock.'}`);
  if (p[5]) bits.push('Pre-order: pay now and we ship as soon as stock reaches us.');
  else if (SLOW[i]) bits.push('Allow 3–5 working days for processing, with delivery within 7 days of purchase. Sent tracked across the UK.');
  else bits.push('Dispatched within 24 hours on business days and sent tracked across the UK.');
  bits.push(`UK delivery ${money(SHIP)}${FREE > 0 ? `, free on orders over ${money(FREE)}` : ''}. 14-day returns.`);
  return bits.join(' ');
}
function tags(p) {
  const t = [];
  if (p[5]) t.push('Pre-order');
  if (!p[2]) t.push('Sold out');
  const l = lang(p); if (l) t.push(l);
  if (/Near Mint/i.test(p[0])) t.push('Near mint');
  return t.map(x => `<span class="tag">${esc(x)}</span>`).join('');
}
function related(i) {
  const p = P[i];
  let r = P.map((q, k) => k).filter(k => k !== i && P[k][2] && P[k][3] === p[3]);
  if (r.length < 4) r = r.concat(P.map((q, k) => k).filter(k => k !== i && P[k][2] && r.indexOf(k) < 0));
  return r.slice(0, 4);
}

const PAGE_CSS = `
.crumbs { font: 500 11px/1.6 var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--fg-dim); margin-bottom: 24px; }
.crumbs a { color: var(--fg-dim); text-decoration: none; } .crumbs a:hover { color: var(--fg); }
.pd { display: grid; gap: clamp(24px, 5vw, 64px); grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; max-width: 1100px; }
.pd .ph { background: var(--bg-raise); border: 1px solid var(--line); border-radius: 4px; aspect-ratio: 1; display: grid; place-items: center; padding: 24px; }
.pd .ph img { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 20px 30px rgba(0,0,0,.6)); }
.pd .ph .none { font: 400 42px var(--display); color: var(--fg-dim); }
.pd h1 { font-size: clamp(28px, 4.2vw, 46px); margin-top: 10px; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 0; }
.tag { font: 500 11px/1 var(--mono); letter-spacing: .1em; text-transform: uppercase; border: 1px solid var(--line); padding: 7px 9px; border-radius: 2px; color: var(--fg-dim); }
.price { font: 400 40px/1 var(--display); color: var(--gold-soft); margin: 22px 0 6px; }
.stock { font: 500 12px var(--mono); letter-spacing: .08em; color: var(--fg-dim); }
.stock.in::before { content: "●"; color: #6fcf7f; margin-right: 8px; }
.buy { display: flex; flex-wrap: wrap; gap: 10px; align-items: stretch; margin: 26px 0 8px; }
.qty { display: flex; border: 1px solid var(--line); border-radius: 2px; }
.qty button { background: none; border: 0; color: var(--fg); width: 40px; font-size: 18px; cursor: pointer; }
.qty input { width: 48px; text-align: center; border: 0; padding: 0; background: none; font: 500 15px var(--mono); -moz-appearance: textfield; }
.qty input::-webkit-outer-spin-button, .qty input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.btn.ghost { background: none; color: var(--fg); border: 1px solid var(--line); }
.btn.ghost:hover { border-color: var(--gold); }
.pd .desc { margin-top: 26px; }
.perks { list-style: none; padding: 0; margin: 22px 0 0; display: grid; gap: 8px; font-size: 15px; }
.perks li::before { content: "✓"; color: var(--gold); margin-right: 10px; }
.rel { max-width: 1100px; margin-top: clamp(48px, 7vw, 88px); }
.rel h2 { font-size: 26px; }
.rgrid { display: grid; gap: 14px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.rgrid a { display: grid; gap: 8px; text-decoration: none; color: var(--fg); background: var(--bg-raise); border: 1px solid var(--line); border-radius: 4px; padding: 12px; font-size: 14px; line-height: 1.35; }
.rgrid a:hover { border-color: var(--gold); }
.rgrid .ri { aspect-ratio: 1; overflow: hidden; } .rgrid img { width: 100%; height: 100%; object-fit: contain; display: block; }
.rgrid b { color: var(--gold-soft); font: 500 14px var(--mono); }
@media (max-width: 760px) { .pd { grid-template-columns: 1fr; } .rgrid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`;

function page(i) {
  const p = P[i], slug = SLUG[i], url = `${SITE}/products/${slug}`, desc = describe(i);
  const metaDesc = (desc.length > 155 ? desc.slice(0, 152).replace(/\s+\S*$/, '') + '…' : desc);
  const title = `${p[0]} | ${money(p[1])} | International TCG UK`;
  const avail = !p[2] ? 'https://schema.org/OutOfStock' : p[5] ? 'https://schema.org/PreOrder' : 'https://schema.org/InStock';
  const valid = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  const ld = [{
    '@context': 'https://schema.org', '@type': 'Product', name: p[0], image: [abs(i)], description: desc, sku: slug,
    brand: { '@type': 'Brand', name: 'Pokémon' }, category: CAT_NAME[p[3]],
    offers: {
      '@type': 'Offer', url, priceCurrency: 'GBP', price: p[1].toFixed(2), priceValidUntil: valid, availability: avail,
      itemCondition: 'https://schema.org/NewCondition', seller: { '@type': 'Organization', name: 'International TCG' },
      shippingDetails: {
        '@type': 'OfferShippingDetails', shippingRate: { '@type': 'MonetaryAmount', value: (FREE > 0 && p[1] >= FREE ? 0 : SHIP).toFixed(2), currency: 'GBP' },
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'GB' },
        deliveryTime: { '@type': 'ShippingDeliveryTime', handlingTime: { '@type': 'QuantitativeValue', minValue: SLOW[i] ? 3 : 0, maxValue: SLOW[i] ? 5 : 1, unitCode: 'DAY' }, transitTime: { '@type': 'QuantitativeValue', minValue: 1, maxValue: SLOW[i] ? 2 : 3, unitCode: 'DAY' } }
      },
      hasMerchantReturnPolicy: { '@type': 'MerchantReturnPolicy', applicableCountry: 'GB', returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow', merchantReturnDays: 14, returnMethod: 'https://schema.org/ReturnByMail', returnFees: 'https://schema.org/ReturnFeesCustomerResponsibility' }
    }
  }, {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Shop', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: CAT_PLURAL[p[3]], item: SITE + '/#shop' },
      { '@type': 'ListItem', position: 3, name: p[0], item: url }]
  }];
  const img = IMG[i]
    ? `<img src="${cdn(i, 900)}" onerror="if(this.src.indexOf('/.netlify/images')>-1)this.src='/${esc(IMG[i])}'" alt="${esc(p[0])}" width="900" height="900" fetchpriority="high">`
    : `<span class="none">${esc(CAT_NAME[p[3]])}</span>`;
  const rel = related(i).map(k => `<a href="/products/${SLUG[k]}"><span class="ri">${IMG[k] ? `<img src="${cdn(k, 360)}" onerror="if(this.src.indexOf('/.netlify/images')>-1)this.src='/${esc(IMG[k])}'" alt="" loading="lazy">` : ''}</span>${esc(P[k][0])}<b>${money(P[k][1])}</b></a>`).join('');
  const buy = p[2]
    ? `<div class="buy"><div class="qty"><button type="button" id="dn" aria-label="One less">−</button><input id="q" type="number" min="1" max="20" value="1" aria-label="Quantity"><button type="button" id="up" aria-label="One more">+</button></div>
<button class="btn" id="now" type="button">${p[5] ? 'Pre-order now' : 'Buy now'}</button><button class="btn ghost" id="add" type="button">Add to cart</button></div><p class="ok" id="note" role="status"></p>`
    : `<div class="buy"><a class="btn" href="/#contact">Sold out. Ask us about restocks</a></div>`;
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(metaDesc)}">
<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.ico?v=2" sizes="any"><link rel="icon" href="/favicon.svg?v=2" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2">
<meta property="og:type" content="product">
<meta property="og:site_name" content="International TCG">
<meta property="og:title" content="${esc(p[0])}">
<meta property="og:description" content="${esc(metaDesc)}">
<meta property="og:image" content="${abs(i)}">
<meta property="og:url" content="${url}">
<meta property="product:price:amount" content="${p[1].toFixed(2)}">
<meta property="product:price:currency" content="GBP">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;1,6..96,400&family=Hanken+Grotesk:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="/pages.css">
<link rel="stylesheet" href="/products/product.css">
</head>
<body>
<header class="nav"><div class="wrap"><a class="logo" href="/" aria-label="INT TCG, home"><img src="/img/logo.svg" alt="INT TCG" width="740" height="450"></a><a class="back" href="/?cart=1#shop" id="cartlink">Cart</a></div></header>
<main><div class="wrap" style="max-width:1100px">
<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Shop</a> / <a href="/#shop">${esc(CAT_PLURAL[p[3]])}</a> / ${esc(p[0])}</nav>
<div class="pd">
<div class="ph">${img}</div>
<div>
<div class="eyebrow">${esc(CAT_NAME[p[3]])}</div>
<h1>${esc(p[0])}</h1>
<div class="tags">${tags(p)}</div>
<div class="price">${money(p[1])}</div>
<div class="stock${p[2] ? ' in' : ''}">${!p[2] ? 'Sold out' : p[5] ? 'Available to pre-order' : SLOW[i] ? 'In stock · 3–5 day processing · delivered within 7 days' : 'In stock, ships within 24 hours'}</div>
${buy}
<p class="desc">${esc(desc)}</p>
<ul class="perks"><li>100% genuine Pokémon TCG product</li><li>Tracked UK delivery ${money(SHIP)}${FREE > 0 ? `, free over ${money(FREE)}` : ''}</li><li>14-day returns. See <a href="/delivery-returns">delivery &amp; returns</a></li><li>Secure checkout by Stripe</li></ul>
</div>
</div>
${rel ? `<section class="rel"><h2>You might also like</h2><div class="rgrid">${rel}</div></section>` : ''}
</div></main>
<footer><div class="wrap"><a href="/">Shop</a><a href="/sell">Sell to us</a><a href="/delivery-returns">Delivery &amp; returns</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><span>int.tcg@gmail.com</span></div></footer>
<script>
(function () {
  var T = ${JSON.stringify(p[0])}, I = ${i};
  try { sessionStorage.setItem('intcg-trailer', '1'); } catch (e) {}
  function cart() { try { return JSON.parse(localStorage.getItem('intcg_cart') || '{}') || {}; } catch (e) { return {}; } }
  function count() { var c = cart(), n = 0; for (var k in c) n += c[k]; document.getElementById('cartlink').textContent = n ? 'Cart (' + n + ')' : 'Cart'; }
  count();
  var q = document.getElementById('q'); if (!q) return;
  function qty() { var v = Math.max(1, Math.min(20, parseInt(q.value, 10) || 1)); q.value = v; return v; }
  document.getElementById('up').onclick = function () { q.value = qty() + 1; qty(); };
  document.getElementById('dn').onclick = function () { q.value = qty() - 1; qty(); };
  q.onchange = qty;
  document.getElementById('add').onclick = function () {
    var c = cart(); c[T] = Math.min(20, (c[T] || 0) + qty());
    try { localStorage.setItem('intcg_cart', JSON.stringify(c)); } catch (e) {}
    location.href = '/?cart=1#shop';
  };
  document.getElementById('now').onclick = function () {
    var b = this, note = document.getElementById('note'); b.disabled = true; b.textContent = 'Opening checkout…'; note.textContent = '';
    fetch('/.netlify/functions/create-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ i: I, t: T, q: qty() }] }) })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) { if (res.ok && res.d.url) { location.href = res.d.url; return; } throw new Error(res.d.error || 'Checkout is unavailable right now.'); })
      .catch(function (err) { note.textContent = err.message + ' Please try again or email int.tcg@gmail.com.'; b.disabled = false; b.textContent = 'Buy now'; });
  };
})();
</script>
</body>
</html>
`;
}

const pdir = path.join(root, 'products');
fs.rmSync(pdir, { recursive: true, force: true });
fs.mkdirSync(pdir, { recursive: true });
fs.writeFileSync(path.join(pdir, 'product.css'), PAGE_CSS.trim() + '\n');
P.forEach((p, i) => fs.writeFileSync(path.join(pdir, SLUG[i] + '.html'), page(i)));

// ---- 4) sitemap + Google Merchant Center feed ----
const today = new Date().toISOString().slice(0, 10);
const fixed = [['/', 'daily', '1.0'], ['/sell', 'monthly'], ['/delivery-returns', 'yearly'], ['/terms', 'yearly'], ['/privacy', 'yearly']];
const urls = fixed.map(u => `  <url><loc>${SITE}${u[0]}</loc><changefreq>${u[1]}</changefreq>${u[2] ? `<priority>${u[2]}</priority>` : ''}</url>`)
  .concat(SLUG.map(s => `  <url><loc>${SITE}/products/${s}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`));
fs.writeFileSync(path.join(root, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);

// Pre-orders are left out of the feed: Google needs a confirmed release date for those.
const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const items = P.map((p, i) => i).filter(i => !P[i][5] && IMG[i]).map(i => {
  const p = P[i];
  return `<item>
<g:id>${x(SLUG[i]).slice(0, 50)}</g:id>
<title>${x(p[0]).slice(0, 150)}</title>
<description>${x(describe(i))}</description>
<link>${SITE}/products/${SLUG[i]}</link>
<g:image_link>${x(abs(i))}</g:image_link>
<g:availability>${p[2] ? 'in_stock' : 'out_of_stock'}</g:availability>
<g:price>${p[1].toFixed(2)} GBP</g:price>
<g:condition>new</g:condition>
<g:brand>Pokémon</g:brand>
<g:identifier_exists>no</g:identifier_exists>
<g:product_type>${x(CAT_PLURAL[p[3]])}</g:product_type>
<g:min_handling_time>${SLOW[i] ? 3 : 0}</g:min_handling_time>
<g:max_handling_time>${SLOW[i] ? 5 : 1}</g:max_handling_time>
<g:shipping><g:country>GB</g:country><g:price>${(FREE > 0 && p[1] >= FREE ? 0 : SHIP).toFixed(2)} GBP</g:price></g:shipping>
</item>`;
});
fs.writeFileSync(path.join(root, 'feed.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
<title>International TCG</title>
<link>${SITE}/</link>
<description>Pokémon TCG booster boxes, ETBs, packs and singles, shipped from the UK</description>
${items.join('\n')}
</channel>
</rss>
`);

console.log('Built ' + P.length + ' products (' + Object.keys(IMG).length + ' with photos), ' + P.length + ' product pages, ' + items.length + ' feed items');
