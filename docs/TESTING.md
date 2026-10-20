# Trekiva Notify: end-to-end test checklist

Use a development store, or a test product on your real store. Keep the Resend dashboard open to watch emails.

## Setup
- [ ] `/healthz` returns ok; the app opens in the Shopify admin; Home shows the setup guide.
- [ ] Theme editor: app embed **Trekiva Notify** is on and the theme is saved.
- [ ] Settings → Sender: **Send test** arrives, with the right sender name, subject and layout.

## Product page
- [ ] Set one variant's inventory to 0 (continue selling OFF). Open its product page, select that variant: a full-width **Notify Me** button replaces Add to cart and Buy it now.
- [ ] Select an in-stock variant: the original buttons return, Notify Me is gone. Switch back and forth several times.
- [ ] Product with some variants in stock: the "mixed stock" subtext shows under the button.
- [ ] Variant with continue-selling ON and 0 stock: no Notify Me button.
- [ ] Reload a sold-out variant's page several times: the native Add to cart / Buy it now never flash before Notify Me appears.
- [ ] Theme editor → App embeds → Trekiva Notify → "Replace Add to cart and Buy it now when sold out" off: the theme's own sold-out behaviour is untouched.
- [ ] Block the app (turn the server off) and reload: the native buttons come back by themselves within 4 seconds.

## Signup
- [ ] Click Notify Me: the modal shows the right copy and the variant name.
- [ ] Invalid email: the error text from the editor shows. Valid email: confirmation message, then the button reads "You'll be notified".
- [ ] Same email again for the same variant: still a success message, and Subscribers shows one row.
- [ ] Subscribers lists the request as **Pending** with the right product and page.
- [ ] Six quick submissions from one browser: the sixth is refused ("Too many attempts").

## Cards
- [ ] Mark a whole product sold out. Collection page, search results and (if enabled) home page show a small Notify me button on its card.
- [ ] Collection page, open a product's quick-buy drawer and pick a sold-out size: Notify Me replaces the "Sold out" button; pick an in-stock size and the theme's button returns.
- [ ] Load more products (pagination or infinite scroll): new sold-out cards get the button too.
- [ ] Editor → Show button on: untick **Collection page** but keep **Quick-buy drawer**: no button on collection cards, but a drawer opened there still shows Notify Me. Then the reverse: cards get the button, drawers keep the theme's "Sold out".
- [ ] Editor → Product options: try "Specific products" and "Exclude tags" and confirm the button follows the rule.

## Restock
- [ ] In Shopify admin, raise that variant's stock to the threshold. Within about a minute: an email arrives from your sender, with the product image, price and a Buy now link to the exact variant.
- [ ] Subscribers shows the request as **Notified**; Resend shows the email as delivered.
- [ ] Raise stock again (or edit it): no second email.
- [ ] Settings → Location-based alerts: tick only another location, restock at the first one: no email. Restock at the ticked one: email sent.
- [ ] Settings → threshold 5: restock to 3, no email; restock to 5, email.

## Unsubscribe, bounce, revenue
- [ ] Email's Unsubscribe link: first shows a confirm page; the button unsubscribes (status **Unsubscribed**). Opening the link alone changes nothing.
- [ ] Sign up with an address that bounces (e.g. `bounced@resend.dev`): status moves to **Unsubscribed** after Resend reports it.
- [ ] Click Buy now in a restock email and complete a test order: Notify me revenue on Home shows the order value for that variant.

## Safety nets
- [ ] Missed webhook: sign up, restock the variant while the app is stopped, start the app and call `/api/cron/reconcile` with the secret: the email goes out.
- [ ] Cron endpoints without or with a wrong secret return 401 (the built-in schedules need no secret).
- [ ] After a restart the logs show "scheduler started"; a report that was due while the app was down arrives within a minute or two.
- [ ] Reports: Settings → Send a sample report: the email arrives with an Excel file attached; open it and check both sheets (Summary and Requests).
- [ ] Reports: Settings → Weekly report to your address, then (for a test) set `lastReportAt` back in the database and call `/api/cron/reports`: the summary arrives with every new request in the attached Excel file.
- [ ] Subscribers → Export Excel, Export PDF and Export CSV (with and without a status filter): each opens, the filter is applied, times are in your store's time zone, and product, variant and SKU are names (not ids).
- [ ] Settings → File attached to the report: pick Excel, PDF, then Excel and PDF and use Send a sample report each time; the right attachment(s) arrive.
- [ ] Theme editor preview mode: the button does not appear while editing.
