// Copies the product list (var P = [...]) out of index.html so the checkout
// function always charges the same prices the site shows. Runs on every Netlify build.
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/var P = (\[[\s\S]*?\n\s*\]);/);
if (!m) { console.error('Could not find "var P = [...]" in index.html'); process.exit(1); }
const P = JSON.parse(m[1]);
const products = P.map((p, i) => ({ i, title: p[0], price: p[1], inStock: !!p[2], preorder: !!p[5] }));
products.forEach(p => {
  if (typeof p.title !== 'string' || !(p.price > 0)) { console.error('Bad product at index ' + p.i); process.exit(1); }
});
const out = path.join(__dirname, '..', 'netlify', 'functions', 'products.json');
fs.writeFileSync(out, JSON.stringify(products, null, 1));
console.log('Synced ' + products.length + ' products to netlify/functions/products.json');
