International TCG - int-tcg.com (Netlify + Stripe Checkout)

Files
  index.html                          the site
  data/products.json                  THE PRODUCT LIST (edit it at int-tcg.com/admin)
  admin/                              the shop admin page (Decap CMS)
  thanks.html                         page customers land on after paying
  sell.html                           sell-to-us page with request form (photos allowed)
  terms.html, privacy.html, delivery-returns.html   legal pages (pages.css styles them)
  netlify/functions/create-checkout.js  creates the Stripe payment page from the cart
  scripts/sync-products.js            on each deploy, copies data/products.json into index.html and the checkout,
                                      builds a page per product at int-tcg.com/products/<name>, and rebuilds
                                      sitemap.xml and the Google Shopping feed at int-tcg.com/feed.xml
  products/, feed.xml                 made automatically on each deploy (not stored in GitHub)
  netlify.toml                        tells Netlify how to build

Netlify environment variables (Project configuration > Environment variables)
  STRIPE_SECRET_KEY    required. sk_test_... to test, sk_live_... to take real payments
  SHIPPING_GBP         optional. UK delivery charge. Default 3.99
  FREE_SHIPPING_OVER   optional. Free delivery at/above this basket total. Default 200. 0 = never free

To add a product, change a price or mark something sold out: go to int-tcg.com/admin,
log in with GitHub, edit Shop > Products, click Publish. The site updates in about a minute.
Note: deploy from GitHub (or Netlify CLI). Drag-and-drop uploads do not run the checkout function.
Contact email: int.tcg@gmail.com

Forms (contact, newsletter, sell request) go to Netlify Forms: Netlify > Forms.
Turn on email alerts there (Forms > Form notifications) so each one lands in your inbox.
Business address for the legal pages: edit "Kent, United Kingdom" in terms.html and privacy.html.
If you change delivery prices, also update the wording in delivery-returns.html and the cart note in index.html.

Google Ads / Google Shopping
  Every product has its own page, e.g. int-tcg.com/products/ascended-heroes-booster-bundle-6-pack
  The address comes from the product name, so renaming a product changes its address (update any ads that use it).
  Merchant Center: add a scheduled feed with the URL https://int-tcg.com/feed.xml (pre-orders are left out).

Live orders and stock
  int-tcg.com/admin/orders.html (or the "Live orders" button in /admin) lists paid Stripe orders, refreshing every 30 seconds.
    It uses the same GitHub login as /admin: log in to /admin first in the same browser. No extra password.
  Stock counting: /admin > Shop > Settings > Stock counting (on/off). Off by default.
    When on, each product's "Stock count" is the starting number: products sell out at 0, customers can't buy
    more than you have, and paid orders count the number down automatically. Typing a new number in /admin
    restarts counting from that number. Products with a blank count are not counted.
    Live counts are kept in Netlify Blobs (built into Netlify, nothing to set up). Orders are counted when the
    customer reaches the thank-you page, and any missed ones are caught the next time the orders page is opened.
