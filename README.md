# Trekiva Notify

Back-in-stock alerts for Shopify. When a variant is sold out, a **Notify me when available** button replaces Add to cart / Buy it now. The customer leaves an email; when stock returns, the app emails them through Resend.

Custom-distribution app for your own store (not on the App Store). Stack: React Router 7, Prisma + PostgreSQL, Shopify theme app extension, Resend, Vitest.

- Plan and design decisions: [plan.md](plan.md)
- Deploying: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- End-to-end test checklist: [docs/TESTING.md](docs/TESTING.md)

## How it works
1. `extensions/trekiva-notify` (app embed + optional product-page block) shows the button on product pages and on collection/search/home cards.
2. Signups go through the app proxy (`/apps/notify/subscribe`) and are stored as `Subscription` rows.
3. Shopify's `inventory_levels/update` webhook queues emails when stock reaches your threshold; a worker sends them in batches through Resend.
4. Missed webhooks are caught by a nightly reconcile; failed sends retry with backoff.
5. `orders/paid` credits revenue to the email an order came from.

## Local development
```sh
cp .env.example .env          # fill in Shopify and Resend values
npm install
npm run db:up                 # Postgres on localhost:5434 (needs Docker)
npx prisma migrate deploy
npm run dev                   # shopify app dev
```
Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. The unit tests need no database.

## Scheduled jobs
The server runs these itself (`app/scheduler.server.ts`): restock-email retries every minute, a report check every 10 minutes, and a stock check for missed webhooks every 6 hours. To use an external scheduler instead, set `DISABLE_SCHEDULER=true` and call these with `Authorization: Bearer $CRON_SECRET`:

| Endpoint | Suggested schedule |
|---|---|
| `/api/cron/process-jobs` | every minute |
| `/api/cron/reports` | hourly |
| `/api/cron/reconcile` | nightly |

## Layout
- `app/routes/` admin pages (`app.*`), storefront API (`api.public.*`), cron (`api.cron.*`), webhooks (`webhooks.*`)
- `app/restock/` stock decision, email queue, worker, reconcile
- `app/email/` Resend client, email template, sender address
- `app/settings/` defaults, validation schemas, persistence
- `app/reports/` report schedule, report email, and the Excel workbook and PDF (summary + requests, with product / variant / SKU names) attached to reports (Settings: Excel, PDF or both) and used by the Subscribers export
- `extensions/trekiva-notify/` storefront script, styles and theme blocks
# Trekiva-Notify
