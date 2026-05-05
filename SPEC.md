# Quick Commerce Billing Hub — תוכנית implementation

## Context

### למה עושים את זה
היום כל מוצר ב-Quick Commerce (QS10, QuickChat, Clickynder, Ines, Mobile) משכפל לעצמו אינטגרציית PayPlus, dashboard, cron jobs ו-billing logic. ב-QS10 כבר יש **~2,300 שורות** של billing code יציב בייצור — billing-service.ts (1,457), 6 cron jobs (~600), dunning-notifications.ts (~240). הבעיה: כל מוצר חדש = לכתוב מחדש. אין view אחיד על לקוחות שצורכים כמה מוצרים.

### מה בונים
שירות נפרד (`billing-hub`) שמרכז:
- ניהול state של מנויים, lifecycle, dunning, trial
- API ל-products (Bearer + HMAC-signed)
- אינטגרציית PayPlus יחידה (חשבון אחד; חשבוניות מופקות ע"י PayPlus עם `initial_invoice: true`)
- דשבורד פנימי בלבד (סגנון Morning/Grow)
- Cron jobs ב-QStash לחיובים חוזרים
- Webhook delivery engine ל-products

### Phase 1 Scope
- **QS10** — fresh start: מהגרים רק מנויים פעילים + payment_methods, אז dual-write קצר ואז cutover
- **QuickChat** — אינטגרציה ראשונה כ-second product (no commission, רק subscription)
- שאר המוצרים יצטרפו ב-Phase 2

### החלטות שסוכמו
| נושא | בחירה |
|---|---|
| מוצר #2 | **QuickChat** |
| Migration | **Fresh start + מנויים פעילים בלבד** |
| Proration | **שינוי בתום תקופה** |
| Trial ללא token בסוף | **ביטול מיידי** (status=cancelled) |
| Domain | Vercel temporary |
| VAT default | **18%** (תואם QS10) |
| Hosting | Vercel |
| DB | Neon חדש (מופרד מ-QS10) |
| Email | Resend (להחליף את SendGrid של QS10) |
| Monitoring | אין כרגע |
| PayPlus webhook routing | uid + more_info (belt & suspenders) |
| Dunning sender | Billing Hub ישירות |
| Dunning policy | **3 retries: 1, 3, 7 ימים** (יותר אגרסיבי מ-QS10's 0/3/7/14) |
| Customer identity | email + phone = same customer cross-product (multiple subs) |
| QuickChat plans seed | אין seed — נוצר מהדשבורד ב-wizard |
| PayPlus credentials | אותם של QS10 (terminal/cashier/page יחידים) |
| QStash | חשבון Upstash חדש (isolation) |
| Dual-write duration | ייקבע בזמן אמת לפי תוצאות shadow |

### דוגמת עבודת המערכת
> סוחר ב-QS10 משלם ₪399/חודש + 0.5% עמלות. אותו סוחר (אותו email/phone) רשום גם ל-QuickChat ומשלם שם ₪599. **שלוש גביות נפרדות, שלוש חשבוניות נפרדות, customer record יחיד.**

---

## QS10 Existing Code Map (lift-and-adapt source)

### Schema — `/Users/tadmitinteractive/Desktop/quickshop10/src/lib/db/schema.ts`

| QS10 Table | Line | Hub Equivalent |
|---|---|---|
| `storeSubscriptions` | 3981 | `subscriptions` (+ `customer_product_links`) |
| `platformInvoices` | 4035 | `invoices` |
| `platformInvoiceItems` | 4085 | `invoice_items` (טבלה נפרדת — שונה מ-jsonb שתכננתי) |
| `storeTransactionFees` | 4108 | `commission_charges` |
| `pluginPricing` | 4142 | `addon_catalog` (Phase 2) |
| `platformSettings` | 4164 | `platform_settings` (זהה) |

**Enums to mirror:**
- `subscriptionStatusEnum` (line 25): trial/active/past_due/cancelled/expired (+`paused` שלנו)
- `platformInvoiceTypeEnum` (line 33): subscription/transaction_fee/plugin/email_package (+`addon`/`manual` שלנו)
- `platformInvoiceStatusEnum` (line 40): draft/pending/paid/failed/cancelled (+`refunded` שלנו)

**שינוי ב-Hub:** מוסיפים `invoice_items` כטבלה נפרדת (לא jsonb) — תואם ל-QS10's pattern, מאפשר reporting טוב יותר.

### Core billing logic — `/Users/tadmitinteractive/Desktop/quickshop10/src/lib/billing/billing-service.ts`

פונקציות מפתח לlift (כל אחת תועתק ותותאם):

| Function | Line | Hub adaptation |
|---|---|---|
| `generateInvoiceNumber()` | 77 | פר product: `QS10-2025-NNNNNN`, `QC-2025-NNNNNN` |
| `getOrCreateSubscription(storeId)` | 95 | → `getOrCreateSubscription(customerId, productId)` |
| `activateSubscription(storeId, ...)` | 152 | → `activateSubscription(subscriptionId, paymentMethodId)` |
| `createSubscriptionInvoice` | 402 | identical |
| `chargeTransactionFees(storeId, p1, p2)` | 465 | → `chargeCommissions(customerId, productId, p1, p2)` |
| `chargePluginFees` | 672 | → `chargeAddons` (Phase 2) |
| `renewSubscription(storeId)` | 794 | → `renewSubscription(subscriptionId)`, idempotency-guarded |
| `getStoreBillingSummary` | 1020 | → `getCustomerBillingSummary(customerId)` cross-product |
| `getStoresDueForRenewal` | 1171 | → `getSubscriptionsDueForRenewal()` |
| `getStoresDueForTransactionFees` | 1191 | → `getCustomersDueForCommissionFlush(productId)` |
| `isDueForRetry(count, lastAt)` | 1235 | adapt to **1/3/7 schedule** (vs QS10's 0/3/7/14) |
| `getStoresDueForDunningRetry` | 1247 | identical |
| `retryFailedInvoices(storeId)` | 1278 | → `retryFailedInvoices(subscriptionId)` |
| `resetDunningState` | 1407 | identical |
| `getDunningInfo(subscription)` | 1424 | identical |

### Settings cache — `platform-settings.ts` (225 lines)
- 5-min TTL Map cache (line 16: `CACHE_TTL = 5 * 60 * 1000`)
- `invalidateSettingsCache()` after writes (line 32)
- Default keys (lines 19-25): `subscription_branding_price=299`, `subscription_quickshop_price=399`, `transaction_fee_rate=0.005`, `vat_rate=0.18`, `subscription_trial_days=7`
- → copy מלא, רק להחליף DB connection ול-product-aware (מפתחות פר product)

### PayPlus client — `payplus-billing.ts` (781 lines)
ENV vars:
```
PAYPLUS_API_URL (default: https://restapidev.payplus.co.il/api/v1.0)
PAYPLUS_API_KEY, PAYPLUS_SECRET_KEY
PAYPLUS_TERMINAL_UID, PAYPLUS_CASHIER_UID, PAYPLUS_PAYMENT_PAGE_UID
```
Functions to lift:
- `chargeWithToken` (line 317) — recurring charge with `initial_invoice: true`
- `verifyPayPlusCallback` (line 143) — HMAC verification
- `initiateSubscriptionPayment` — generates payment page link
- `getTransactionDetails` (line 465) — fetch invoice info
- `generateInvoice` (line 510) — fallback invoice generation
- `calculateSubscriptionPrice`, `calculateTransactionFee` — VAT math

### Cron handlers — `/src/app/api/cron/billing/`

| QS10 Cron | Schedule | Hub Equivalent | Schedule |
|---|---|---|---|
| `subscription-renewal` | daily 02:00 | same | 02:00 |
| `transaction-fees` | 1st + 15th 03:00 | `commission-flush` | 1st + 15th 03:00 |
| `plugin-fees` | monthly | `addon-billing` (Phase 2) | monthly |
| `email-packages` | 1st 05:00 | (Phase 2 / not in scope) | - |
| `retry-failed-charges` | daily 06:00 | `dunning-retry` | 04:00 |
| `trial-expiration` | daily 00:00 | `trial-expiry` | 05:00 |

**QStash signature verification:** `/src/lib/qstash.ts:21` `verifyQStashSignature()` — copy as-is.

### Dunning notifications — `dunning-notifications.ts` (240 lines)
- Transport: **SendGrid** (`/lib/email`) — replace with **Resend** in Hub
- `sendDunningNotifications(storeId, currentAttempt)` (line 198)
- Two templates:
  - `buildOwnerEmailHtml` (line 69) — to merchant, every attempt, RTL Hebrew
  - `buildAdminEmailHtml` (line 135) — to `quickshop.israel@gmail.com`, attempt ≥ 2
- Variables: storeName, failedChargeCount, daysUntilSuspension, updateUrl
- → port templates 1:1, swap transport to Resend

### PayPlus callback handler
- `/src/app/api/payments/callback/route.ts` — generic with `?provider=payplus&store={slug}`
- Validates HMAC signature, parses callback body, updates `platformInvoices.status`
- Idempotency: skip if invoice already `paid`
- → in Hub: `/api/webhooks/payplus` (no slug param; lookup via `transaction_uid` in `charges.payplus_response` + fallback to `more_info_1`)

### Merchant call sites (UI/API)

QS10 endpoints to refactor in Phase 3 (Cutover):

| QS10 Route | Action | Hub equivalent |
|---|---|---|
| POST `/api/platform/billing/initiate` | Subscribe / change plan | `POST /api/v1/subscriptions` + `POST /api/v1/payment-methods/setup` |
| POST `/api/platform/billing/callback` | PayPlus subscription callback | (gone — Hub handles directly) |
| POST `/api/platform/billing/update-payment-method` | Card update | `POST /api/v1/payment-methods/setup` |
| POST `/api/platform/billing/update-card-callback` | Card update callback | (gone — Hub handles) |
| POST `/api/shops/{slug}/billing-details` | Update billing info | `PATCH /api/v1/customers/:id` |
| POST `/api/admin/stores/{id}/subscription` | Admin actions (retry, extend, cancel) | various Hub admin endpoints |
| POST `/api/admin/invoices/{id}` | Invoice retry/refund | `POST /api/v1/invoices/:id/refund` |
| POST `/api/admin/stores/{id}/manual-charge` | Manual charge | `POST /api/v1/subscriptions/:id/charge-now` |
| POST `/api/admin/stores/{id}/custom-pricing` | Override price/fee | `PATCH /api/v1/subscriptions/:id` |

**UI files to update:**
- `/src/app/shops/[slug]/admin/settings/subscription/subscription-manager.tsx` — switch from local API to Hub API
- `/src/app/admin/billing/page.tsx` — choose: keep local QS10 admin UI reading from Hub, OR redirect users to billing-hub dashboard
  - **Recommendation:** keep QS10 admin UI as it is for now, switch data source to Hub API. Long-term: deprecate.

---

## Hub Tech Stack

| שכבה | בחירה |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript |
| ORM | Drizzle |
| DB | Postgres (Neon serverless) |
| Dashboard auth | NextAuth (Google OAuth) |
| API auth | Bearer token + HMAC-SHA256 + Idempotency-Key |
| Cron | Upstash QStash |
| Email | Resend |
| UI | Tailwind + shadcn/ui (RTL/Hebrew) |
| Hosting | Vercel |

---

## Hub Database Schema (15 tables)

מבנה מלא ב-[SPEC.md סעיף 3](file:///Users/tadmitinteractive/Desktop/Projeccts/quick-payments-billing/SPEC.md). עדכונים מהsearch:

**שינויים מהSPEC המקורי:**
1. הוספת `invoice_items` כטבלה נפרדת (תואם QS10's `platformInvoiceItems`)
2. `platform_settings` keys כוללים גם `vat_rate`, `dunning_intervals` (configurable per product)
3. Hub-specific addition: `platform_settings` יכלול גם `default_trial_days_per_product`

**טבלאות:**
1. `products` — QS10, QuickChat seed
2. `customers` — UNIQUE email
3. `customer_product_links` — M:N
4. `plans` — per product
5. `subscriptions` — main lifecycle
6. `subscription_addons` — separate billing
7. `commission_charges` — push-per-order
8. `payment_methods` — PayPlus tokens
9. `invoices` — mirror of PayPlus invoices
10. `invoice_items` — line items (NEW)
11. `charges` — attempt history
12. `payment_method_setup_sessions` — short-lived for tokenization flow (NEW)
13. `webhook_endpoints`
14. `webhook_deliveries`
15. `audit_log`
16. `staff_users`
17. `platform_settings`

---

## Implementation Steps

### שלב 0 — Setup (יום 1)
- [ ] `pnpm create next-app billing-hub` (TypeScript, App Router, Tailwind, ESLint)
- [ ] `pnpm add drizzle-orm @neondatabase/serverless drizzle-kit @upstash/qstash next-auth resend`
- [ ] `pnpm add -D @types/node tsx`
- [ ] shadcn init + base components (button, input, table, dialog, command, badge)
- [ ] Neon project + DATABASE_URL in .env.local
- [ ] Drizzle config + first empty migration
- [ ] Initial commit

### שלב 1 — Schema + Seed (יום 2)
**Critical files:**
- `src/lib/db/schema.ts` — port from `/Users/tadmitinteractive/Desktop/quickshop10/src/lib/db/schema.ts:3981-4180` + adapt
- `src/lib/db/client.ts` — Neon serverless connection
- `src/lib/db/queries/` — split by domain (subscriptions, invoices, customers, ...)
- `drizzle/migrations/0001_initial.sql`
- `scripts/seed-products.ts` — QS10 בלבד (QuickChat ייווצר מהדשבורד דרך wizard)
- `scripts/seed-plans.ts` — QS10 בלבד: branding ₪299, quickshop ₪399
- `scripts/seed-platform-settings.ts` — vat_rate=0.18, dunning intervals, default_trial_days

### שלב 2 — PayPlus client (יום 3)
**Lift-and-adapt:**
- copy `/Users/tadmitinteractive/Desktop/quickshop10/src/lib/billing/payplus-billing.ts` → `src/lib/payplus/`
- split into: `client.ts` (HTTP), `tokenize.ts`, `charge.ts`, `refund.ts`, `webhooks.ts`, `vat.ts`
- remove dependency on QS10's `platform-settings.ts` → use Hub's
- env vars in `.env.local`

### שלב 3 — Auth + Idempotency (יום 4)
**Critical files:**
- `src/lib/auth/hmac.ts` — Bearer + signature + timestamp validation
- `src/lib/auth/idempotency.ts` — store + replay (using `idempotency_keys` table or Redis)
- `src/lib/auth/nextauth.ts` — Google OAuth + staff_users
- `middleware.ts` — protect `/api/v1/*` and `/(dashboard)`
- `src/lib/qstash.ts` — copy from QS10's `/src/lib/qstash.ts:21`

### שלב 4 — Settings cache (יום 4)
- copy `/Users/tadmitinteractive/Desktop/quickshop10/src/lib/billing/platform-settings.ts` → `src/lib/settings/`
- adapt for product-aware keys
- `getSubscriptionPricing(productId)`, `getFeeRates(productId)`

### שלב 5 — Core API (ימים 5-7)
**Endpoints (priority order):**
1. `POST /api/v1/customers` (upsert by email)
2. `POST /api/v1/payment-methods/setup` → returns PayPlus payment page URL
3. `POST /api/webhooks/payplus` (callback for tokenization + charges)
4. `POST /api/v1/subscriptions`
5. `GET /api/v1/subscriptions/:id`
6. `PATCH /api/v1/subscriptions/:id` (change_at_period_end logic)
7. `POST /api/v1/subscriptions/:id/cancel`
8. `POST /api/v1/subscriptions/:id/charge-now`
9. `POST /api/v1/commissions` (idempotency-key on `source_external_id`)
10. `GET /api/v1/invoices`
11. `POST /api/v1/invoices/:id/refund`

### שלב 6 — Cron Jobs (ימים 8-9)
**Lift from QS10:**
- subscription-renewal: copy logic from `/src/app/api/cron/billing/subscription-renewal/route.ts`
- commission-flush: from `transaction-fees/route.ts`
- dunning-retry: from `retry-failed-charges/route.ts` — **change DUNNING_RETRY_DAYS to [1, 3, 7]**
- trial-expiry: from `trial-expiration/route.ts` — **change to immediate cancel** (not just expire)

**Hub paths:**
- `src/app/api/cron/daily-billing-run/route.ts`
- `src/app/api/cron/commission-flush/route.ts`
- `src/app/api/cron/dunning-retry/route.ts`
- `src/app/api/cron/trial-expiry/route.ts`
- `src/app/api/cron/metrics-rollup/route.ts`

### שלב 7 — Email (Resend) (יום 10)
**Port templates from QS10's `dunning-notifications.ts`:**
- `dunning-attempt-1.tsx` (יום 1)
- `dunning-attempt-2.tsx` (יום 3)
- `dunning-attempt-3.tsx` (יום 7) — final warning
- `subscription-cancelled.tsx`
- `trial-ending-soon.tsx` (3 ימים לפני)
- `trial-cancelled.tsx`

Variables match QS10: storeName→customerName, failedChargeCount, daysUntilSuspension, updateUrl (now points to product's site, not Hub).

### שלב 8 — Webhook delivery (יום 11)
- `src/lib/webhooks/delivery.ts` — outbound HMAC-signed POST
- `src/lib/webhooks/retry.ts` — exponential backoff: 1m → 5m → 30m → 2h → 12h → dead
- `src/app/api/cron/webhook-retry/route.ts` — every 1m via QStash

### שלב 9 — Dashboard (ימים 12-15)
**Screens (priority order):**
1. Login (Google OAuth)
2. `/customers` — search + table (⌘K command palette)
3. `/customers/:id` — profile + tabs (subs, invoices, payment methods, audit)
4. `/subscriptions` — list + filters
5. `/subscriptions/:id` — detail + actions
6. `/invoices` — list + PDF preview (iframe → PayPlus URL)
7. `/products` — CRUD + plans + API keys + **Create Product Wizard** (multi-step: details → plans → webhook config → API key generation). דרך הזו מוסיפים QuickChat ושאר המוצרים.
8. `/analytics` — MRR/ARR/churn (port logic from QS10's `/admin/billing/page.tsx`)
9. `/settings` — platform settings + staff users

### שלב 10 — Migration + Dual-write (שבוע 2)
**`scripts/migrate-from-qs10.ts`** (active subs only):
```sql
-- From QS10 DB:
SELECT s.*, st.id, st.name, st.slug, st.email
FROM store_subscriptions s
JOIN stores st ON st.id = s.storeId
WHERE s.status IN ('active', 'trial')
  AND s.payplusTokenUid IS NOT NULL
```
For each row:
1. INSERT customer (email = billingEmail or st.email, name, phone, vat_number)
2. INSERT customer_product_links (product=qs10, external_id=storeId, external_slug=slug)
3. INSERT payment_methods (port payplusCustomerUid, payplusTokenUid, card_*)
4. INSERT subscription (status, period dates, plan_id, custom_pricing)

Validation: count match, MRR sum match.

**Dual-write (3-5 days):**
- QS10's billing-service.ts: add `process.env.HUB_DUAL_WRITE=true` flag
- After every `INSERT/UPDATE` on storeSubscriptions/platformInvoices/storeTransactionFees → also POST to Hub
- Hub stores incoming events with `mode='shadow'` flag (don't actually charge)
- Daily compare script: Hub's intended charges vs QS10's actual

### שלב 11 — Cutover (שבוע 3)
1. **Day 0**: Disable QS10 cron jobs (env flag `BILLING_HANDLED_BY_HUB=true`)
2. **Day 0**: Switch Hub to live mode (cron actually charges)
3. **Day 0**: Refactor QS10 endpoints to call Hub API:
   - `/api/platform/billing/initiate` → calls Hub
   - `/api/platform/billing/update-payment-method` → calls Hub
   - `/api/shops/{slug}/billing-details` → calls Hub
   - `/api/admin/stores/{id}/subscription` actions → Hub
   - `/api/admin/invoices/{id}` actions → Hub
4. **Day 0**: Remove QS10's PayPlus callback (`/api/platform/billing/callback`) — Hub handles
5. **Day 0**: subscription-manager.tsx fetches from Hub API
6. **Day 1-7**: monitor closely, daily metrics review
7. **Day 14+**: Begin QuickChat integration

### שלב 12 — QuickChat integration (Phase 1.5)
- צוות יוצר QuickChat דרך **Create Product Wizard** בדשבורד (שלב 9.7)
- ה-wizard מייצר: product row, API key, webhook secret, plans
- QuickChat code מוסיף Hub API client lib
- Implement subscribe / payment-method / cancel flows
- No commission (Phase 1)

---

## Critical File Reference

### Lift-and-adapt from QS10
| Source | Destination |
|---|---|
| `/src/lib/db/schema.ts:3981-4180` | `billing-hub/src/lib/db/schema.ts` |
| `/src/lib/billing/payplus-billing.ts` | `billing-hub/src/lib/payplus/*.ts` |
| `/src/lib/billing/billing-service.ts` | `billing-hub/src/lib/billing/*.ts` |
| `/src/lib/billing/platform-settings.ts` | `billing-hub/src/lib/settings/index.ts` |
| `/src/lib/billing/dunning-notifications.ts` | `billing-hub/src/lib/email/dunning.ts` |
| `/src/lib/qstash.ts` | `billing-hub/src/lib/qstash.ts` |
| `/src/app/api/cron/billing/*/route.ts` | `billing-hub/src/app/api/cron/*/route.ts` |
| `/src/app/admin/billing/page.tsx` | reference for `/analytics` MRR logic |
| `/src/app/admin/billing/stores/[id]/page.tsx` | reference for `/customers/:id` UI |
| `/src/app/shops/[slug]/admin/settings/subscription/subscription-manager.tsx` | reference for plan/payment UX patterns |

### New in Hub
| File | Purpose |
|---|---|
| `src/lib/auth/hmac.ts` | API authentication |
| `src/lib/auth/idempotency.ts` | Replay prevention |
| `src/lib/webhooks/delivery.ts` | Outbound webhook engine |
| `scripts/migrate-from-qs10.ts` | Active subs migration |
| `src/components/command-palette/` | ⌘K search across customers/subs/invoices |
| `src/app/(dashboard)/analytics/page.tsx` | MRR/ARR/churn |

### QS10 files to MODIFY in Phase 3 (cutover)
| File | Change |
|---|---|
| `/src/app/api/platform/billing/initiate/route.ts` | Replace direct DB writes + PayPlus calls with Hub API call |
| `/src/app/api/platform/billing/update-payment-method/route.ts` | Replace with Hub call |
| `/src/app/api/shops/[slug]/billing-details/route.ts` | Replace with Hub call |
| `/src/app/api/admin/stores/[id]/subscription/route.ts` | Replace with Hub admin call |
| `/src/app/api/admin/invoices/[id]/route.ts` | Replace with Hub call |
| `/src/app/api/admin/stores/[id]/manual-charge/route.ts` | Replace with Hub call |
| `/src/app/api/admin/stores/[id]/custom-pricing/route.ts` | Replace with Hub `PATCH /api/v1/subscriptions/:id` |
| `/src/app/shops/[slug]/admin/settings/subscription/subscription-manager.tsx` | Fetch from Hub instead of local |
| `/src/app/api/payments/callback/route.ts` | Remove `?provider=payplus` branch (Hub handles) |
| `/src/lib/billing/billing-service.ts` | Mark deprecated, schedule for deletion in Phase 4 |
| `/src/app/api/cron/billing/*` | Disable via env flag, schedule for deletion |

### QS10 files to DELETE in Phase 4 (post-stable)
- All of `/src/lib/billing/` (after 30 days stable)
- All of `/src/app/api/cron/billing/`
- `/src/app/api/platform/billing/callback/route.ts`
- `/src/app/api/platform/billing/update-card-callback/route.ts`

---

## Verification Plan

### Unit
- HMAC sign/verify roundtrip (timestamp window, body integrity)
- Idempotency replay returns cached response
- Drizzle schema constraints (unique email, FK cascades, CHECK enums)
- VAT calculation at 18% for various amounts (QS10 parity tests)
- Dunning schedule: failedChargeCount=1 + 1 day → due, count=1 + 23h → not due

### Integration (against PayPlus dev env)
- Tokenization: setup → fake card on PayPlus dev → callback received → payment_method created
- Recurring charge: subscription due today → cron triggers → PayPlus charged → invoice with PayPlus URL
- Failed charge → dunning attempt 1 email → 3 days later retry → success → state reset
- Trial expiry without token → status=cancelled (immediate)
- Commission push: 50 events → flush → 1 invoice with sum
- Refund: invoice paid → POST refund → PayPlus refunded → status='refunded'

### End-to-end Migration
1. Snapshot QS10 production billing tables
2. Run migrate script against snapshot in staging
3. Validate: row counts match, MRR sum matches, payment_methods all have valid tokens
4. Run dual-write for 3 days
5. Daily diff Hub planned charges ↔ QS10 actual; threshold 0%

### Cutover smoke test (Day 0)
- New merchant signup in QS10 → routed to Hub → PayPlus → token saved in Hub → invoice in Hub
- Existing merchant card update → routed to Hub → token updated
- Admin retry on failed invoice → Hub charges → invoice updated
- Manual cron trigger → renewal runs → charges happen → webhook 'invoice.paid' fires to QS10

---

## Open Items (יסגרו במהלך הimplementation)

1. **Staff users initial list** — Google emails + roles. ייקבע לפני deployment.
2. **QuickChat plans + מחירים** — ייוצרו דרך ה-wizard בדשבורד אחרי שלב 9.
3. **QuickChat integration timing** — אחרי QS10 cutover יציב (≥14 ימים stable).
4. **Dual-write duration** — ייקבע בזמן אמת לפי daily diff metrics. הסיום ייקבע ע"י המשתמש נקודתית.
