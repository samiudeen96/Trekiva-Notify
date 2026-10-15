# Trekiva Notify: deployment

Stack: `nginx` (TLS) → `trekiva-notify` (Node 22, non-root) → `postgres` (internal network only, persistent volume). Same shape as Trekiva Discount.

## 0. Prerequisites
- A VM with Docker + Docker Compose and a DNS A record such as `notify.example.com` pointing at it.
- A Shopify Partner app named **Trekiva Notify**, distribution set to **Custom** (your store only).
- A Resend account with an API key and your sending domain verified (Resend → Domains).

## 1. Create and link the app (on your laptop)
1. Partner Dashboard → Apps → Create app → name it **Trekiva Notify** → Distribution → **Custom**, enter your store domain.
2. In the project folder: `npm run config:link` and pick that app. This replaces `client_id` in `shopify.app.toml`.
3. Edit `shopify.app.toml` with the real URL: `application_url`, `[auth] redirect_urls` and `[app_proxy] url` (`https://notify.example.com/api/public`, subpath `notify`, prefix `apps`).
4. Copy the client ID and secret for the server `.env`.

## 2. Configure the server
```sh
git clone <your repo> /opt/trekiva-notify && cd "/opt/trekiva-notify/Trekiva Notify"   # or copy the project
cp .env.example .env
```
Fill in `.env`:
- `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL=https://notify.example.com`, `SERVER_NAME=notify.example.com`
- `SCOPES=read_products,read_inventory,read_locations,read_orders` (must match `shopify.app.toml`)
- `POSTGRES_PASSWORD=$(openssl rand -hex 24)` (hex keeps it URL-safe; compose builds `DATABASE_URL` from the `POSTGRES_*` values)
- `CRON_SECRET=$(openssl rand -hex 24)`
- `RESEND_API_KEY`, `EMAIL_FROM="Trekiva <notify@yourdomain.com>"` (address on the verified domain), optional `EMAIL_REPLY_TO`
- `RESEND_WEBHOOK_SECRET` (step 5)

Never commit `.env`.

## 3. HTTPS and start
Pick one (same as Trekiva Discount):
- **Managed reverse proxy (Elestio):** set `APP_BIND=172.17.0.1`, point the proxy at port `3000`, then `docker compose up -d --build postgres trekiva-notify`.
- **Bundled nginx:** put `fullchain.pem` and `privkey.pem` in `deploy/certs/`, then `docker compose up -d --build`.

The app runs `prisma migrate deploy` on every start, so migrations apply automatically. Check `https://notify.example.com/healthz` returns `{"status":"ok"}`.

## 4. Register the app with Shopify
From the project folder on your laptop: `shopify app deploy`. This publishes the config (scopes, webhooks, app proxy) and the theme extension. Then install the app on your store from the Partner Dashboard (Custom distribution → install link) and approve the scopes.

## 5. Resend webhook
Resend → Webhooks → Add endpoint: `https://notify.example.com/api/resend/webhook`, events **email.delivered**, **email.bounced**, **email.complained**. Copy the signing secret into `RESEND_WEBHOOK_SECRET` and restart: `docker compose up -d`.

## 6. Scheduled calls
On the VM, `crontab -e` (the app listens on `127.0.0.1:3000`; change the port if you changed `APP_PORT`):
```cron
* * * * *  curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/process-jobs >/dev/null
0 * * * *  curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/reports >/dev/null
30 2 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/reconcile >/dev/null
0 3 * * *  /opt/trekiva-notify/Trekiva\ Notify/deploy/backup.sh
```
Put `CRON_SECRET=...` at the top of the crontab (cron does not read `.env`).

## 7. Merchant setup
1. Open the app. **Home → Setup guide**: step 1 opens the theme editor with the **Trekiva Notify** app embed ready to switch on; save the theme.
2. **Notify me → Customize**: set the button, signup form and email design. Check the live preview.
3. **Settings → Sender**: set a reply-to and press **Send test** to see the real email.
4. Optional: in the theme editor add the **Notify me button** block to the product template to control its position.
5. Whether Add to cart / Buy it now are hidden on a sold-out variant is a setting on the app embed itself (theme editor → App embeds → Trekiva Notify), so it applies before the page paints. If your theme leaves other purchase buttons visible, add their selectors to "Extra selectors to hide".
6. Run the checklist in [TESTING.md](TESTING.md), then press **Everything is great** in the setup guide.

## 8. Operations
- Health: `GET /healthz`. Logs: `docker compose logs -f trekiva-notify` (JSON; tokens and emails redacted).
- Emails stuck? Check `RESEND_API_KEY` / `EMAIL_FROM`; while either is missing, jobs stay queued and are sent once it is set.
- Update: `git pull && docker compose up -d --build`, then `shopify app deploy` if `shopify.app.toml` or the extension changed.
- Restore a backup: `gunzip -c backups/<file> | docker compose exec -T postgres psql -U $POSTGRES_USER -d $POSTGRES_DB`.
- Postgres publishes no ports; do not add a `ports:` entry to it.

## 9. Known limits
- The PDF report draws with the fonts in `assets/fonts/` (Noto Sans, SIL Open Font License); the Docker image copies them in. A PDF holds the latest 500 requests; the Excel file holds up to 50,000.
- The rate limiter is in memory, so run a single app instance.
- Collection rules apply on product pages only; cards cannot tell which collections a product is in.
- The "Delivered" status depends on the Resend webhook being configured.
