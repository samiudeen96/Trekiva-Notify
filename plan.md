# Trekiva Notify — Back-in-Stock Alerts (Shopify App)

When a product/variant is sold out, show a **"Notify me when available"** button. The customer enters their email; when stock returns, the app emails them via **Resend**.

> **Distribution: custom app for my own store(s) only — not listed on the Shopify App Store.** No billing, no App Store review.

> Assumed stack (same as Trekiva apps): Shopify Remix app template, Prisma + Postgres, Theme App Extension, Vitest. Change if you prefer otherwise.

---

## 1. How it works (end to end)

1. Customer browses any page that shows products (product page, collection, search, home featured, recommendations, quick view). A sold-out variant/product shows **Notify me when available**.
2. Customer submits email → storefront calls the **App Proxy** (`/apps/notify/subscribe`) → app saves a `Subscription` (status `PENDING`).
3. Merchant restocks → Shopify fires `inventory_levels/update` webhook → app resolves the variant, checks total available > 0.
4. App finds all `PENDING` subscriptions for that variant, enqueues emails, sends via Resend, marks `NOTIFIED`.
5. Email links back to the product page (variant preselected) with an unsubscribe link.

---

## 2. Shopify setup

### Scopes
- `read_products` — product/variant titles, images, URLs
- `read_inventory` — required for `inventory_levels/update` webhook and availability checks
- `read_locations` — location-based alerts
- `read_orders` — revenue-converted attribution

### Webhooks (in `shopify.app.toml`)
| Topic | Purpose |
|---|---|
| `inventory_levels/update` | Main trigger for restock |
| `products/update` | Catch "continue selling" / status changes, keep product cache fresh |
| `products/delete` | Cancel pending subscriptions for deleted product |
| `orders/paid` | Revenue converted attribution |
| `app/uninstalled` | Clean up shop data / pause sending |
| `customers/data_request`, `customers/redact`, `shop/redact` | GDPR (mandatory) — delete subscriber emails on request |

### Theme App Extension (`extensions/trekiva-notify/`)
Works on **every page that shows a product**, not only the product page. Two layers:

1. **App embed (global script)** — one toggle in Theme Settings → App embeds. `notify.js` loads on all pages and:
   - Scans the DOM for product cards (`[data-product-id]`, `.card-wrapper`, `.product-card`, links to `/products/{handle}`) on collection, search, home, cart-recommendations, quick-view, and infinite-scroll/AJAX-loaded content (`MutationObserver`).
   - For each card, reads availability from a lightweight map the embed outputs in Liquid (`window.TrekivaNotify.sold_out = {variantId: true}`) or, for cards not covered, fetches `/products/{handle}.js` (cached) to get `variants[].available`.
   - Injects a **Notify me** button into the card (replacing the sold-out "Sold out" label/disabled add-to-cart).
   - Merchant-configurable selectors in the embed settings as a fallback for custom themes.
2. **App block** "Notify Me Button" — placed manually on the product template (and any section that has a product: featured product, quick-buy) for precise placement and per-block styling.

Shared JS behavior (`notify.js`):
- Product page: detect current variant (`variant:change` / URL `?variant=` / form `input[name=id]`); on cards: use the card's default/first available variant, or a variant picker if the card has one. For multi-variant sold-out cards, modal lists the sold-out variants to pick from.
- Show the button only when the variant is unavailable (`inventoryPolicy = DENY`, quantity ≤ 0).
- Modal (preferred on cards) or inline form: email field, optional consent checkbox, honeypot field.
- POST to `/apps/notify/subscribe` with `{ variantId, productId, email, pageType }`.
- Success / error / "already subscribed" states; remember subscribed variants in `localStorage` to show "You'll be notified".
- **Product page layout (target, matches Trekiva theme mockups):**
  - In stock: unchanged — quantity, **Add to cart**, **Buy it now**.
  - Selected variant sold out (e.g. Tan / size 6): the Add to cart + Buy it now/dynamic checkout row is replaced by one **full-width "Notify Me" button** (same height/radius/black style as the theme's primary button). Quantity selector stays. The theme's "Sold out" price badge stays as is.
  - Switching to an in-stock variant restores the original buttons instantly (no reload); switching back to a sold-out one shows Notify Me again.
  - Variants are color swatches + size buttons, so availability is per color/size combination: read `variants[].available` for the exact selected combo (option1/option2), not product-level availability.
- **Replace purchase buttons when sold out (embed setting, ON by default for this store):**
  - Hides "Add to cart" / "Buy it now" / dynamic checkout buttons (Shop Pay, Apple Pay) only while the selected variant is unavailable, and renders Notify Me in their place.
  - Selectors are editable (defaults: `form[action*="/cart/add"] [type=submit]`, `.shopify-payment-button`, `[data-shopify="payment-button"]`; tune for the Trekiva theme).
  - Never hide anything for variants with `inventoryPolicy = CONTINUE` (Shopify treats them as available).
  - Only storefront buttons are affected; Shopify checkout itself is not modified.
- CSS: customizable via embed/block settings (button text, colors, border radius, success message, show on: product / collection / search / home toggles).

### App Proxy
- Prefix `apps`, subpath `notify` → proxied to `/api/public/subscribe`.
- **Verify the proxy HMAC signature** on every request (`authenticate.public.appProxy`).
- Rate limit per IP + per email (e.g. 5 req/min) and reject honeypot hits.

---

## 3. Data model (Prisma)

```prisma
model Shop {
  id          String   @id            // shop domain
  installedAt DateTime @default(now())
  plan        String   @default("free")
  settings    Settings?
}

model Subscription {
  id          String   @id @default(cuid())
  shop        String
  productId   String
  variantId   String
  inventoryItemId String?
  email       String
  status      SubStatus @default(PENDING)   // PENDING | NOTIFIED | UNSUBSCRIBED | FAILED
  createdAt   DateTime @default(now())
  notifiedAt  DateTime?
  unsubToken  String   @unique @default(cuid())
  marketingOptIn Boolean @default(false)
  pageType    String?
  revenue     Decimal? // attributed order value after notification

  @@unique([shop, variantId, email])
  @@index([shop, variantId, status])
  @@index([shop, inventoryItemId, status])
}

model NotificationLog {
  id             String   @id @default(cuid())
  subscriptionId String
  resendId       String?          // Resend email id
  status         String           // SENT | DELIVERED | BOUNCED | COMPLAINED | FAILED
  error          String?
  createdAt      DateTime @default(now())
}

model Settings {
  shop         String @id
  buttonText   String @default("Notify me when available")
  fromName     String?
  replyTo      String?
  subject      String @default("{{product}} is back in stock!")
  emailBody    String?            // optional custom HTML/template
  // + button style fields
  senderEmail        String?          // must be on the domain verified in Resend
  enabled            Boolean @default(true)       // storefront master toggle
  enabledLocationIds String[]                     // locations that trigger alerts (empty = all)
  minStockThreshold  Int     @default(1)          // notify when stock >= this
  reportFrequency    String?          // DAILY | WEEKLY | MONTHLY | null
  reportEmail        String?
  reportCc           String[]
  // editor content (JSON): button, signupForm, emailTemplate texts + colors
  buttonConfig       Json
  formConfig         Json
  emailConfig        Json     // sender name, subject, preview text, body template
  showOn             String[] @default(["product"])   // product | collection | search
  productRule        Json     // { mode: ALL|EXCLUDE_PRODUCTS|EXCLUDE_TAGS|SPECIFIC|COLLECTIONS|TAGS, ids/tags }
}
```

---

## 4. Restock detection logic

`inventory_levels/update` payload gives `inventory_item_id`, `location_id`, `available` — **not** the variant. So:

1. Look up variant by `inventory_item_id` (stored on subscription at subscribe time, or GraphQL `inventoryItem(id){ variant { id product { id } } }`).
2. If no `PENDING` subs for that item → return 200 immediately (cheap path).
3. Query variant total `inventoryQuantity` (sum across locations) or `availableForSale`. Only proceed if `>= minStockThreshold` (counting only `enabledLocationIds` when set).
4. Respect `inventoryPolicy = CONTINUE` (oversell) — then the button shouldn't show at all.
5. Fetch product title, image, handle for the email.
6. Enqueue send jobs. Return 200 fast (Shopify expects <5s); do the sending out of band.

Edge cases:
- Webhook delivered multiple times → idempotent: only flip `PENDING → NOTIFIED` atomically (`updateMany where status=PENDING`).
- Stock of 1 and 500 subscribers → still notify all (merchant setting later: "notify first N only").
- Variant sells out again → new subscription is allowed after status is `NOTIFIED` (unique key needs handling: reuse row by resetting to `PENDING`).
- Webhooks can be missed → nightly reconciliation job scans subs with `PENDING` and checks actual stock.

---

## 5. Email sending with Resend

- Env: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (default sender), `APP_URL`.
- Send from your own verified Resend domain (e.g. `notify@trekiva.com`) with your store name as `From` display name and `Reply-To` = your support email.
- Use `resend.batch.send` (up to 100 emails per call) for bulk restocks.
- Throttle to Resend rate limit (default 2 req/s) — queue with retry + exponential backoff on 429/5xx.
- Email template: product image, title, variant, price, **"Buy now"** button → `https://{shop}/products/{handle}?variant={id}&utm_source=trekiva_notify`.
- Footer: unsubscribe link `/api/unsubscribe/{token}` + `List-Unsubscribe` header.
- Build template with React Email (`@react-email/components`) or plain HTML string.
- **Resend webhook** (`/api/resend/webhook`, verify Svix signature): `email.delivered`, `email.bounced`, `email.complained` → update `NotificationLog`; auto-unsubscribe on bounce/complaint.

---

## 6. Job queue

Keep simple at first:
- `NotificationJob` table (or `pg-boss`) processed by a worker/cron endpoint.
- Webhook handler only inserts jobs; worker sends in batches with throttling and retries (max 5).
- Alternative: Vercel/Fly cron hitting `/api/cron/process-jobs` every minute.

---

## 7. Admin UI (embedded, Polaris)

Reference: the screens you shared. Left nav: **Home · Notify me · Subscribers · Settings** (Automations later).

### 7.1 Home (`/app`)
- **Setup guide** with progress bar (n of 3): ① Activate app embed in Shopify (detect via theme `settings_data.json` / Asset API) ② Customize notify me button ③ Confirm flow works (buttons "Everything is great" / "Contact support").
- Stat tiles: **Notify me revenue**, **Pending**, **Notified**.
- "Notify Me" card with Active badge + "Setup alert" button.

### 7.2 Notify me (`/app/notify-me`)
- Header: "Back in stock alert" + **Active** badge + master on/off toggle.
- "Personalize notify me flow": three cards, each with a **Customize** button → opens the editor on that tab (Button / Signup form / Notification email).
- Stats: **Pending request**, **Notified request**, **Revenue converted**. Links: Edit alert, View report.

### 7.3 Editor (full-screen modal, Save / Close, live preview on the right)
Tabs: **Button · Signup Form · Email notification · Email settings**.

**Button tab**
- *Button customize*: button text (default "Notify me when available"), **mixed-stock subtext** (shown when some variants are in stock and others sold out, e.g. "Get notified when your item is back in stock"), border radius, text color, background color, subtext color.
- *Show button on*: Product page / Collection page / Search page checkboxes.
- *Product options* (which sold-out products get the button): All out of stock products (default) · Exclude products · Exclude tags · Specific products · Product collections · Product tags. Product/collection pickers use the Shopify resource picker. Evaluated in the storefront JS from a rules map output by the embed (product ids, tags, collection ids).
- Live preview: product card with size options, the theme's disabled "Sold out" button and the Notify button.

**Signup Form tab** (the modal)
- *Form content*: header, description, email placeholder, email error text, button text, terms message ("No spam. Unsubscribe anytime."). Modal also shows the selected variant label (e.g. "Medium / Black").
- *Opt-in marketing*: checkbox "Ask customers to receive marketing emails" (stores `marketingOptIn` on the subscription; optionally creates/updates a Shopify customer with email marketing consent — needs `write_customers`, v2).
- *Styling* (collapsible): colors/radius for the modal.
- *Confirm message*: header ("Thanks for your request") + description.

**Email notification tab**
- Email body template editor (logo, heading, body copy, button label, footer) with live preview; variables `{{ product_name }}`, `{{ variant_title }}`, `{{ shop_name }}`, `{{ product_url }}`, `{{ product_image }}`, `{{ price }}`. Rendered to HTML for Resend.

**Email settings tab**
- Sender name, subject (`{{ product_name }} is now available`), preview text (`{{ product_name }} is back in stock`) with an inbox-list preview. Reply-to and "Send test email" live here too.

### 7.4 Subscribers
- Table with filters (product, variant, status, page type, date), search by email, delete, **export CSV**.

### 7.5 Settings (single page, section per row: title + description left, controls right, one Save bar)
  1. **Sender** — default from email (must be on the domain verified in Resend; no domain UI in v1). Defaults from `RESEND_FROM_EMAIL`.
  2. **Storefront** — master toggle, hide-purchase-buttons toggle.
  3. **Location-based alerts** — checkboxes of the shop's locations (GraphQL `locations`); only restocks at ticked locations trigger alerts (none ticked = all).
  4. **Email delivery settings** — "Notify when stock is equal to or greater than N" (`minStockThreshold`, default 1).
  5. **Notify me request alerts** — summary report to you: Daily / Weekly / Monthly, "Send to" email, CC list. Sent only when new requests exist. The merchant picks the frequency (daily, weekly, monthly), the time of day (default 10 AM), the weekday (weekly) or the date 1-28 (monthly), all in the store's time zone; the page shows the next send time and can send a sample report.

### 7.6 Revenue converted (attribution)
- Restock email "Buy now" link carries `?utm_source=trekiva_notify&notify=<unsubToken-or-subId>`.
- Storefront embed stores `notify` in a cart attribute (`/cart/update.js`) on landing.
- `orders/paid` webhook reads the cart note attribute → matches subscription → sums order line value for the notified variant within a 7-day window → shown in tiles. Needs scope `read_orders`.

### 7.7 Onboarding
Setup guide step 1 deep link: `https://{shop}/admin/themes/current/editor?context=apps&activateAppId={api_key}/notify-embed`; optional product-page block link:
`https://{shop}/admin/themes/current/editor?template=product&addAppBlockId={api_key}/notify-button&target=mainSection`

---

## 8. Distribution

Custom distribution: create the app in the Partner Dashboard, set distribution to **Custom**, and install via the generated link on your store. No App Store listing, review, or billing.

---

## 9. Security & compliance

- Verify HMAC for app proxy, Shopify webhooks, and Resend (Svix) webhooks.
- Validate and normalize emails (lowercase, trim, length cap); consider double opt-in toggle.
- Rate limiting + honeypot against abuse (a public endpoint that sends email to arbitrary addresses is a spam vector).
- GDPR webhooks delete/anonymize emails; unsubscribe link always works.
- Never expose `RESEND_API_KEY` to the storefront.

---

## 10. Build phases

| Phase | Deliverable |
|---|---|
| **1. Scaffold** (done) | `shopify app init` (Remix), Prisma + Postgres, auth, `shopify.app.toml` scopes/webhooks, GDPR handlers |
| **2. Storefront** (done in code) | App embed (all pages: product, collection, search, home, quick view) + product-page app block, variant/card detection, modal form, App Proxy subscribe endpoint + signature check + rate limit |
| **3. Restock engine** (done in code) | `inventory_levels/update` handler, variant lookup, job queue, Resend send + template, unsubscribe route |
| **4. Admin** (done in code) | Dashboard, subscriptions list/export, settings, test email, onboarding |
| **5. Resend webhooks + reliability** (done in code) | Delivery/bounce tracking, nightly reconciliation, retries |
| **6. Deploy** (docs written) | Deploy to host, custom-distribution install on your store, final end-to-end test |

---

## 11. Testing

- Unit (Vitest): subscribe validation/dedupe, restock decision logic, template rendering, signature verification.
- Integration: webhook payload → expected jobs created; Resend client mocked.
- Manual on a dev store: set variant inventory to 0 → subscribe → set inventory to 5 → confirm email arrives and link works.
- Test on the Trekiva product page: sold-out color/size combo shows full-width Notify Me in place of Add to cart + Buy it now; selecting an in-stock combo restores them; the hide-buttons setting off keeps the theme's own behavior.
- Test button on product, collection, search, home, and AJAX-loaded cards; variants-change behavior across popular themes (Dawn, Refresh, a 3rd-party theme).

---

## 12. Env vars

```
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SCOPES=read_products,read_inventory
DATABASE_URL=
APP_URL=
RESEND_API_KEY=
RESEND_FROM_EMAIL=notify@yourdomain.com
RESEND_WEBHOOK_SECRET=
CRON_SECRET=
```

---

## 13. Later (optional)

- SMS/WhatsApp alerts
- Low-stock / pre-order alerts
