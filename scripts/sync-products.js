// Runs on every Netlify deploy (see netlify.toml).
// Source of truth: data/products.json (edited through int-tcg.com/admin).
// 1) writes the product list into index.html (var P and var IMG)
// 2) writes netlify/functions/products.json so checkout charges the same prices
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const CATS = ['s', 'p', 'c', 'g', 'b', 'm', 'a'];

const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'products.json'), 'utf8'));
const list = (data.products || []).filter(p => p && p.title);
list.forEach((p, i) => {
  if (!(Number(p.price) > 0)) throw new Error('Product "' + p.title + '" needs a price above 0');
  if (CATS.indexOf(p.category) < 0) throw new Error('Product "' + p.title + '" has an unknown category: ' + p.category);
});

const P = list.map(p => [String(p.title).trim(), Math.round(Number(p.price) * 100) / 100, p.in_stock === false ? 0 : 1, p.category, p.japanese ? 1 : 0, p.preorder ? 1 : 0]);
const IMG = {};
list.forEach((p, i) => { if (p.image) IMG[i] = String(p.image).replace(/^\//, ''); });

const file = path.join(root, 'index.html');
let html = fs.readFileSync(file, 'utf8');
const pRe = /var P = \[[\s\S]*?\n\s*\];/;
const iRe = /var IMG = \{[\s\S]*?\};/;
if (!pRe.test(html) || !iRe.test(html)) throw new Error('Could not find the product list in index.html');
html = html.replace(pRe, () => 'var P = [\n' + P.map(r => '    ' + JSON.stringify(r)).join(',\n') + '\n  ];');
html = html.replace(iRe, () => 'var IMG = ' + JSON.stringify(IMG, null, 4).replace(/\n}/, '\n  }') + ';');
fs.writeFileSync(file, html);

const out = P.map((p, i) => ({ i, title: p[0], price: p[1], inStock: !!p[2], preorder: !!p[5] }));
fs.writeFileSync(path.join(root, 'netlify', 'functions', 'products.json'), JSON.stringify(out, null, 1));
console.log('Built ' + P.length + ' products (' + Object.keys(IMG).length + ' with photos)');
