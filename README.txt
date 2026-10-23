International TCG - int-tcg.com (Netlify + Stripe Checkout)

Files
  index.html                          the site (product list is "var P = [...]" inside it)
  thanks.html                         page customers land on after paying
  sell.html                           sell-to-us page with request form (photos allowed)
  terms.html, privacy.html, delivery-returns.html   legal pages (pages.css styles them)
  netlify/functions/create-checkout.js  creates the Stripe payment page from the cart
  scripts/sync-products.js            copies prices from index.html for the function (runs on each deploy)
  netlify.toml                        tells Netlify how to build

Netlify environment variables (Project configuration > Environment variables)
  STRIPE_SECRET_KEY    required. sk_test_... to test, sk_live_... to take real payments
  SHIPPING_GBP         optional. UK delivery charge. Default 4.99
  FREE_SHIPPING_OVER   optional. Free delivery at/above this basket total. Default 200. 0 = never free

To change a price or mark something sold out: edit its row in "var P" in index.html
([title, price, in stock 1/0, type, japanese 1/0, pre-order 1/0]) and redeploy.
Note: deploy from GitHub (or Netlify CLI). Drag-and-drop uploads do not run the checkout function.
Contact email: int.tcg@gmail.com

Forms (contact, newsletter, sell request) go to Netlify Forms: Netlify > Forms.
Turn on email alerts there (Forms > Form notifications) so each one lands in your inbox.
Business address for the legal pages: edit "Kent, United Kingdom" in terms.html and privacy.html.
If you change delivery prices, also update the wording in delivery-returns.html and the cart note in index.html.
