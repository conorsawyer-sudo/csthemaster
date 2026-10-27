International TCG - int-tcg.com (Netlify + Stripe Checkout)

Files
  index.html                          the site
  data/products.json                  THE PRODUCT LIST (edit it at int-tcg.com/admin)
  admin/                              the shop admin page (Decap CMS)
  thanks.html                         page customers land on after paying
  sell.html                           sell-to-us page with request form (photos allowed)
  terms.html, privacy.html, delivery-returns.html   legal pages (pages.css styles them)
  netlify/functions/create-checkout.js  creates the Stripe payment page from the cart
  scripts/sync-products.js            on each deploy, copies data/products.json into index.html and the checkout
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
