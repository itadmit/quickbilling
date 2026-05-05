# Test scripts — end-to-end flow

Walks the deployed Hub through every billing-pipeline state transition,
using real PayPlus dev credentials and a live token saved via the hosted
payment page.

## Prerequisites

1. **Production deployment is live** at the URL in your `.env.local`
   `NEXT_PUBLIC_APP_URL` (default: `https://billing.my-quickshop.com`).
2. **`.env.local`** has both `PAYPLUS_*` (production) and `PAYPLUS_*_dev`
   (sandbox) credentials, plus `DATABASE_URL` and `QSTASH_TOKEN`.
3. **`PAYPLUS_FORCE_ENV=dev` is set on Vercel production** during the
   test — otherwise the hosted payment page hits the real PayPlus and
   would actually charge a card. Add it in
   `Vercel → Project → Settings → Environment Variables → Production`,
   then redeploy. **Remove it after the test is done.**

## Sandbox cards

```
Successful charge:  5326-1402-8077-9844   05/26   000
Rejected charge:    5326-1402-0001-0120   05/26   000
```

## Phases

```bash
# 1. create test project (quicktest) + plans + write .test-secrets.json
pnpm tsx scripts/test/01-setup.ts

# 2. create customer + payment-method setup, prints PayPlus URL,
#    waits for you to enter the card, then polls until the IPN saves the token.
pnpm tsx scripts/test/02-tokenize.ts

# 3. exercise the full pipeline:
#    create subscription → force charge → record commission →
#    list invoices → refund → cancel-at-period-end
pnpm tsx scripts/test/03-flow.ts

# 4. delete test customer, payment_method, subs, invoices, commissions
#    (the project itself is kept so re-runs are fast)
pnpm tsx scripts/test/04-cleanup.ts
```

## Watching crons fire

```bash
# Switch all 6 schedules to */1 * * * * (every minute) so you can
# observe them in Vercel logs without waiting for tomorrow.
pnpm tsx scripts/qstash-test-mode.ts on

# … wait, watch logs, refresh /analytics in the dashboard …

# Restore production cadence (1/3/02:00 etc.)
pnpm tsx scripts/qstash-test-mode.ts off
```

## After the full test

1. **Remove `PAYPLUS_FORCE_ENV` from Vercel** so production goes back to
   real PayPlus.
2. **Restore QStash schedules** with `qstash-test-mode.ts off`.
3. **Optional**: delete the `quicktest` product entirely from the
   dashboard (`/products/{id}` → "מחק פרוייקט").
