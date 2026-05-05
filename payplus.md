# PayPlus — תיעוד פנימי

> **מסמך זה הוא reference מתומצת של ה-PayPlus REST API לשימוש Quick Commerce Billing Hub בלבד.**
> מכיל רק את הendpoints שאנחנו משתמשים בהם, את מבני ה-request/response עליהם הקוד נשען, ואת ה-quirks שגילינו בפועל מול הקוד.
>
> **זרימה כוללת אצלנו:**
> 1. סוחר נרשם → אנחנו מייצרים payment page (PaymentPages/generateLink) → הסוחר מזין כרטיס → PayPlus יוצר token + שולח callback (IPN)
> 2. בכל מחזור חיוב cron מריץ → קוראים `Transactions/Charge` עם `use_token=true` → PayPlus מחייב + מפיק חשבונית אוטומטית
> 3. אם נכשל — dunning retries
> 4. אם הסוחר רוצה החזר — `Transactions/RefundByTransactionUID`
>
> **לא משתמשים אצל PayPlus:** Customers API, Recurring Payments, Recurring Charges, Reports, Banks, Devices, Invoice+ Documents.

---

## 1. Setup

### 1.1 Environments

| ENV | Base URL |
|---|---|
| **Staging (dev)** | `https://restapidev.payplus.co.il/api/v1.0/` |
| **Production** | `https://restapi.payplus.co.il/api/v1.0/` |

### 1.2 Auth headers

כל קריאת API דורשת שני headers:

```http
api-key: <your api-key>
secret-key: <your secret-key>
Content-Type: application/json
```

⚠️ קריאות חייבות להיעשות **server-side בלבד**. אסור client-side.

### 1.3 Required ENV (אצלנו ב-`.env.local`)

```env
PAYPLUS_API_URL="https://restapidev.payplus.co.il/api/v1.0"
PAYPLUS_API_KEY="..."
PAYPLUS_SECRET_KEY="..."
PAYPLUS_TERMINAL_UID="..."
PAYPLUS_CASHIER_UID="..."
PAYPLUS_PAYMENT_PAGE_UID="..."
```

### 1.4 Sandbox credit cards

| תוצאה | מספר כרטיס | תפוגה | CVV |
|---|---|---|---|
| הצלחה | `5326-1402-8077-9844` | 05/26 | 000 |
| דחייה | `5326-1402-0001-0120` | 05/26 | 000 |

### 1.5 Charge method enum

| Value | Type | תיאור |
|---|---|---|
| **0** | Card Check (J2) | אימות כרטיס בלי החזקת כספים |
| **1** | Charge (J4) | חיוב מיידי (subscription_setup, one-time) |
| 2 | Approval (J5) | hold לכרטיס, חיוב מאוחר (לא משתמשים) |
| 3 | Recurring | הוראות קבע (PayPlus-managed — לא משתמשים) |
| 4 | Refund (J4) | החזר מיידי |
| **5** | Token (J2) | יצירת token בלי לחייב (card_update) |

אנחנו משתמשים רק ב-**1** (חיוב חדש) ו-**5** (עדכון אמצעי תשלום).

### 1.6 Credit terms enum (ב-Charge)

| Value | תיאור |
|---|---|
| **1** | Regular (חיוב רגיל) |
| 6 | Credit (קרדיט) |
| 8 | Payments (תשלומים) |

אצלנו תמיד `1`.

### 1.7 VAT type enum (ב-items)

| Value | תיאור |
|---|---|
| **0** | VAT included |
| 1 | VAT not included |
| 2 | Exempt VAT |

אצלנו תמיד `0` כי אנחנו מחשבים VAT לפני שליחה.

---

## 2. Webhook Verification (Validate Requests Received from PayPlus)

PayPlus חותם כל callback. **חובה לאמת לפני שמעבדים.**

### Headers שמגיעים

```http
hash: <base64 HMAC-SHA256>
user-agent: PayPlus
```

### האלגוריתם

```js
const message = JSON.stringify(parsedBody);   // ⚠️ NOT raw bytes — re-stringified parsed body
const expected = crypto
  .createHmac("sha256", SECRET_KEY)
  .update(message)
  .digest("base64");
return expected === hashHeader && userAgent === "PayPlus";
```

### ⚠️ Quirk שגילינו

PayPlus חותם על `JSON.stringify(parsedBody)` — לא על ה-raw bytes שהגיעו. כלומר:
- צריך לעשות `JSON.parse(rawBody)` ואז שוב `JSON.stringify(parsed)`
- אם הסידור של keys שונה בין PayPlus לבין Node.js → החתימה לא תתאם
- בקוד שלנו (`src/lib/payplus/webhooks.ts`) יש fallback לאימות על raw body אם החתימה הראשית לא מתאמת

### דוגמה לpayload + headers

```http
POST /api/webhooks/payplus
hash: yb4ViUaVO6OFdF9iyISKtCi+cXTvWm0+3e/sQkPsNS0=
user-agent: PayPlus
Content-Type: application/json

{ "transaction_type": "Charge", "transaction": {...}, "data": {...}, "invoice": {...} }
```

---

## 3. Generate Payment Link (PaymentPages/generateLink)

יוצר דף תשלום מארח. אנחנו משתמשים בו ל-tokenization (יצירת token לחיוב חוזר).

```
POST /PaymentPages/generateLink
```

### Request body — fields חשובים אצלנו

```json
{
  "payment_page_uid": "{PAYPLUS_PAYMENT_PAGE_UID}",
  "charge_method": 1,
  "create_token": true,
  "amount": 117.00,
  "currency_code": "ILS",
  "initial_invoice": true,

  "customer": {
    "customer_name": "John Doe",
    "email": "merchant@example.com",
    "phone": "+972501234567",
    "vat_number": "123456789"
  },

  "items": [
    {
      "name": "QuickShop Pro - חודשי",
      "quantity": 1,
      "price": 117.00,
      "vat_type": 0
    }
  ],

  "refURL_success": "https://app.example.com/billing/success",
  "refURL_failure": "https://app.example.com/billing/failed",
  "refURL_callback": "https://billing.quickcommerce.co.il/api/webhooks/payplus",
  "send_failure_callback": true,

  "more_info": "QuickShop Pro - חודשי",
  "more_info_1": "{\"type\":\"subscription_setup\",\"customerId\":\"<uuid>\",\"contextId\":\"<uuid>\"}",

  "language_code": "he",
  "expiry_datetime": "30",
  "sendEmailApproval": true,
  "sendEmailFailure": false
}
```

### ⚠️ Card update flow (תוקן באג)

ל**עדכון כרטיס בלבד** (לא לחייב כלום):
```json
{
  "charge_method": 5,           // ← Token-only J2 (לא 1!)
  "create_token": true,
  "amount": 1.00,               // נדרש פורמלית, לא מחויב בפועל
  "initial_invoice": false,     // לא להפיק חשבונית
  "sendEmailApproval": false
}
```

### Response — 200

```json
{
  "results": {
    "status": "success",
    "code": 0,
    "description": "payment page link is been generated"
  },
  "data": {
    "page_request_uid": "f33f7a1f-5ea7-4857-992a-2da95b369f53",
    "payment_page_link": "https://paymentsdev.payplus.co.il/f33f7a1f-...",
    "qr_code_image": "https://restapidev.payplus.co.il/api/payment-pages/payment-request/.../qr-code"
  }
}
```

### Response — 422

```
"can-not-find-payment-page"
```

(כש-`payment_page_uid` שגוי)

### חשוב

- **`more_info_1` הוא איך אנחנו מזהים את ה-callback** חזרה לסשן בDB שלנו. אנחנו שמים שם JSON עם `customerId` + `contextId` (`payment_method_setup_sessions.id`).
- **`create_token: true`** חיוני — בלי זה לא נקבל token לחיוב חוזר.
- **`refURL_callback` הוא ה-IPN שלנו** — שונה מ-`refURL_success` (browser redirect).

---

## 4. Charge with Saved Token (Transactions/Charge)

חיוב חוזר באמצעות token שנשמר בעבר. השימוש המרכזי שלנו ב-cron יומי.

```
POST /Transactions/Charge
```

### Request body

```json
{
  "terminal_uid": "{PAYPLUS_TERMINAL_UID}",
  "cashier_uid": "{PAYPLUS_CASHIER_UID}",
  "amount": 469.85,
  "currency_code": "ILS",
  "credit_terms": 1,

  "use_token": true,
  "token": "<token_uid from setup>",
  "customer_uid": "<payplus_customer_uid>",

  "initial_invoice": true,

  "products": [
    {
      "name": "QuickShop Pro - חודשי",
      "quantity": "1",
      "price": "469.85",
      "currency_code": "ILS",
      "vat_type": "0"
    }
  ],

  "more_info_1": "{\"type\":\"subscription_renewal\",\"subscriptionId\":\"...\",\"invoiceNumber\":\"QS-2026-000123\"}"
}
```

### ⚠️ Quirk: customer_uid יכול להיכשל

`customer_uid` הוא Mandatory לפי הdocs כש-`use_token=true`, אבל לפעמים PayPlus מחזיר:
```json
{ "results": { "code": 1, "description": "can-not-find-customer" } }
```

הקוד שלנו (`charge.ts`) **מנסה שוב בלי `customer_uid`** — מסתבר שזה עובד עם token לבד.

### Response — 200 (Success)

```json
{
  "results": {
    "status": "success",
    "code": 0,
    "description": "operation has been success"
  },
  "data": {
    "transaction": {
      "uid": "599dbe80-53bf-4e2b-9f66-e38d42b90b68",
      "number": "ha635",
      "type": "internal_page",
      "date": "2021-01-07 16:24:31",
      "status_code": "000",
      "amount": 90,
      "currency": "ILS",
      "credit_terms": "credit",
      "payments": { "number_of_payments": 3, "first_payment_amount": 0, "rest_payments_amount": 0 },
      "secure3D": { "status": false, "tracking": null },
      "approval_number": "0000000",
      "voucher_number": "07-480-067",
      "more_info": "Smart TV",
      "more_info_1": "Additional 1"
    },
    "data": {
      "customer_uid": "ef76432c-769a-43a6-ba7a-6f70272539d8",
      "terminal_uid": "...",
      "cashier_uid": "...",
      "items": [
        {
          "amount_pay": 100,
          "discount_amount": 10,
          "discount_type": "amount",
          "discount_value": 10,
          "quantity": "1",
          "quantity_price": 85.47,
          "product_uid": "ba4c68a6-...",
          "name": "Smart TV"
        }
      ],
      "card_information": {
        "four_digits": "0218",
        "expiry_month": "01",
        "expiry_year": "24",
        "clearing_id": 6,
        "brand_id": 2,
        "issuer_id": 1
      }
    }
  }
}
```

### ⚠️ Nested data structure

שים לב שיש **שני רובדי `data`**:
- `response.data.transaction.uid` — המזהה של הטרנזקציה
- `response.data.data.customer_uid` — המזהה של הלקוח (כן, double `data`)
- `response.data.data.card_information.four_digits` — פרטי הכרטיס

### ⚠️ Invoice בresponse — לא מתועד אבל מגיע

ה-spec לא מציג שדה `invoice` בresponse, **אבל בייצור PayPlus כן מחזיר**:
```json
"data": {
  "transaction": {...},
  "data": {...},
  "invoice": {
    "uuid": "...",
    "docu_number": "...",
    "original_url": "https://...",
    "copy_url": "https://..."
  }
}
```

הקוד שלנו (`charge.ts`) מנסה לקרוא `response.data?.invoice?.uuid` ועובד. אם לא מגיע — נצטרך לקבל מה-IPN.

---

## 5. Refund by Transaction UID (Transactions/RefundByTransactionUID)

החזר עסקה קיימת. אנחנו משתמשים בו דרך הdashboard.

```
POST /Transactions/RefundByTransactionUID
```

### Request body

```json
{
  "transaction_uid": "<original_transaction_uid>",
  "amount": 469.85,
  "more_info": "ביטול מנוי - בקשה של הלקוח",
  "initial_invoice": false
}
```

- `amount` יכול להיות **חלקי** (≤ הסכום המקורי)
- `more_info` ישמש כתיאור line של החשבונית במקרה של החזר חלקי

### Response — 200

```json
{
  "results": { "status": "success", "code": 0, "description": "operation has been success" },
  "data": {
    "transaction": {
      "uid": "e1396310-e3f8-461f-b80a-55b1954311359",
      "number": "gf8708",
      "status_code": "000",
      "amount": 50,
      "approval_number": "3148090",
      "voucher_number": "50-001-187"
    },
    "data": {
      "customer_uid": "...",
      "items": [...],
      "card_information": {
        "token": "3639a5a7-...",
        "four_digits": "1175",
        "expiry_month": "06",
        "expiry_year": "25",
        "brand_id": 10,
        "issuer_id": 1
      }
    }
  }
}
```

### ⚠️ הbug שתיקנו

הQS10-port השתמש בendpoint `Transactions/Refund` (refund-by-card עם terminal_uid, cashier_uid). זה **לא נכון** ל-refund של עסקה קיימת. הendpoint הנכון הוא `Transactions/RefundByTransactionUID` שמקבל רק `transaction_uid` + `amount`.

---

## 6. Transaction View (Transactions/View)

לחיפוש עסקה קיימת — לreconciliation או לקבלת invoice info.

```
POST /Transactions/View
```

### Request body

```json
{ "transaction_uid": "<uid>" }
```

או:
```json
{ "customer_uid": "<uid>", "fromDate": "2026-01-01", "untilDate": "2026-01-31" }
```

### ⚠️ הbug שתיקנו

בקוד הQS10 הendpoint נקרא `Transactions/Info` — לא קיים. הnew code משתמש ב-`Transactions/View`.

---

## 7. Token Management

### 7.1 Check token

```
GET /Token/Check/{uid}
```

#### Response — 200

```json
{
  "results": {
    "status": "success",
    "code": 0,
    "description": "operation has been success"
  },
  "data": {
    "token_uid": "e1396310-...",
    "customer_uid": "03a5734e-...",
    "four_digits": "1234",
    "expiry_month": "01",
    "expiry_year": "21",
    "brand_id": 10,
    "issuer_id": 1,
    "brand_name": "amex",
    "issuer_name": "isracard"
  }
}
```

`brand_name` ו-`issuer_name` מוחזרים ישירות — לא צריך לחפש במיפוי.

### 7.2 Remove token

```
POST /Token/Remove/{uid}
```

Body: `{ "terminal_uid": "..." }`

#### Response — 200

```json
{
  "result": {
    "status": "success",
    "code": 0,
    "description": "operation has been success"
  },
  "data": {}
}
```

### ⚠️ הquirk הקריטי

ה-endpoint **היחיד** של PayPlus שמחזיר wrapper בשם `result` (יחיד) ולא `results` (רבים). אם הקוד מסתמך על `response.results.status` — יחזיר תמיד undefined → false. הקוד שלנו (`tokens.ts`) מטפל ב-2 הגרסאות:
```ts
const wrapper = raw.results ?? raw.result;
return wrapper?.status === "success";
```

---

## 8. Callback Shapes — IPN vs Browser Redirect

PayPlus שולח **2 צורות שונות** של אותו מידע — תלוי בURL של היעד.

### 8.1 IPN — `refURL_callback` (server-to-server)

מבנה **nested**. שדות מפתח:

```json
{
  "transaction_type": "Charge",
  "transaction": {
    "uid": "dcb11c1e7-...",
    "payment_request_uid": "ef76432c-...",
    "number": "fd138",
    "status_code": "000",
    "amount": 1,
    "currency": "ILS",
    "credit_terms": "regular",
    "approval_number": "002341",
    "voucher_number": "15-901-901",
    "more_info_1": "{...JSON שלנו...}",
    "secure3D": { "status": false, "tracking": null },
    "recurring_charge_information": {
      "recurring_uid": "...",
      "charge_uid": "..."
    }
  },
  "data": {
    "customer_uid": "3bcc6b2d-...",
    "terminal_uid": "...",
    "cashier_uid": "...",
    "items": [...],
    "card_information": {
      "card_holder_name": "Moshe Cohen",
      "four_digits": "6134",
      "expiry_month": "09",
      "expiry_year": "24",
      "brand_id": 8,
      "issuer_id": 6,
      "card_foreign": 99,
      "card_bin": "375510",
      "identification_number": "123456789",
      "token": "<TOKEN UID — אחרי tokenization>"
    },
    "hash_data": "<base64 customer details — אם create_hash=true>"
  },
  "invoice": {
    "uuid": "65ad5633-...",
    "docu_number": "90191",
    "original_url": "https://invoice.company.co.il/...",
    "copy_url": "https://invoice.company.co.il/.../copy",
    "integrator_name": "Invoice Company",
    "status": "Success",
    "brand_name": "..."
  }
}
```

### 8.2 Browser Redirect — `refURL_success` / `refURL_failure`

מבנה **flat**. כל השדות top-level:

```json
{
  "transaction_uid": "e6228e7d-...",
  "page_request_uid": "7712bc5a-...",
  "type": "Charge",
  "method": "credit-card",
  "number": "VdOzii",
  "date": "2022-01-09 16:33:09",
  "status": "approved",
  "status_code": "000",
  "status_description": "העסקה בוצעה בהצלחה",
  "amount": 100,
  "currency": "ILS",
  "approval_num": "5019440",
  "voucher_num": "01-001-820",
  "more_info": "...",
  "customer_uid": "...",
  "customer_email": "test@test.com",
  "customer_name": "...",
  "four_digits": "1175",
  "expiry_month": "04",
  "expiry_year": "26",
  "brand_id": 10,
  "brand_name": "amex",
  "issuer_id": 1,
  "issuer_name": "isracard",
  "card_holder_name": "...",
  "card_bin": "375510",
  "identification_number": "..."
}
```

### 8.3 בדיקת הצלחה

הצלחה ⇔ `status === "approved"` **או** `status_code === "000"`.

ב-IPN: `payload.transaction.status_code === "000"`.
ב-Redirect: `payload.status_code === "000"` או `payload.status === "approved"`.

הקוד שלנו (`webhooks.ts → normalizePayPlusEvent`) מטפל בשני המבנים אוטומטית.

### 8.4 קודי שגיאה נפוצים (status_code)

| status_code | משמעות |
|---|---|
| 000 | הצלחה |
| 003 | התקשר לחברת האשראי |
| 004 | סירוב |
| 005 | חשבון מוגבל |
| 033 | כרטיס פג תוקף |
| 036 | גיבוי לא נתמך |

(רשימה חלקית; הרשימה המלאה ב-Dictionary/ErrorCodes)

---

## 9. Brand ID → Name Mapping

```
1  isracard
2  mastercard
3  visa
4  diners
5  amex
6  discover
7  jcb
8  leumi
10 maestro
```

מקור: Dictionary/Brands List + תצפיות מהקוד.

ב-IPN שלנו, אם מקבלים רק `brand_id` משתמשים ב-`brandNameFromId()` ב-`webhooks.ts`.

---

## 10. הבאגים שתוקנו (היסטוריה)

| # | באג | תיקון |
|---|---|---|
| 1 | webhook handler ציפה ל-flat structure (top-level) | יצרנו `normalizePayPlusEvent()` שמטפל ב-IPN nested + flat redirect |
| 2 | `Transactions/Refund` (refund by card) במקום by-uid | החלפה ל-`Transactions/RefundByTransactionUID` |
| 3 | `Transactions/Info` לא קיים | החלפה ל-`Transactions/View` |
| 4 | `Customers/Search` לא קיים | הוסרה הקריאה — אנחנו לא צריכים את ה-API הזה |
| 5 | `generateInvoiceForTransaction` קרא ל-`Invoices/Generate` שלא קיים | הוסר — `initial_invoice: true` ב-Charge מספיק |
| 6 | Card-update עם `charge_method: 1` חייב 1 ₪ | `charge_method: 5` (Token-only J2) — בלי חיוב |
| 7 | `Customers/Add` שלח `address`/`city`/`country_iso` | `business_address`/`business_city`/`business_country_iso` (אבל הסרנו את הקריאה לגמרי) |
| 8 | `successStatus` היה `["1", "OK", "approved"]` | `status === "approved" \|\| status_code === "000"` |
| 9 | Token/Remove חוזר עם `result` (יחיד) | `wrapper = raw.results ?? raw.result` |
| 10 | חתימת webhook על raw body | על `JSON.stringify(JSON.parse(rawBody))` (עם fallback raw) |

---

## 11. מבנה הקוד שלנו (`src/lib/payplus/`)

```
client.ts        — config + base request fn (api-key/secret-key headers)
types.ts         — TypeScript interfaces (BillingCustomer, ChargeResult, ...)
vat.ts           — withVat() / fromTotal() — חישובי 18%
payment-page.ts  — generatePaymentPageLink() — charge_method 1 / 5
charge.ts        — chargeWithToken() — recurring with use_token
transactions.ts  — getTransactionDetails() / refundTransaction()
tokens.ts        — checkToken() / removeToken()
webhooks.ts      — verify + normalizePayPlusEvent + brand_id mapping
index.ts         — barrel export
```

---

## 12. Endpoints שאנחנו **לא** משתמשים בהם

לתיעוד עתידי בלבד — אם נצטרך:

| Endpoint | למה לא | מתי כן? |
|---|---|---|
| `Customers/*` | יש לנו טבלת `customers` משלנו | אם נרצה sync דו-כיווני |
| `RecurringPayments/*` | אנחנו מנהלים scheduling ב-cron | אם נרצה ש-PayPlus ינהל |
| `RecurringCharges/*` | אותה סיבה | אותה סיבה |
| `Banks/*` | לא מנהלים בנקים של סוחר | אם נוסיף הוראות קבע בנקאיות |
| `Devices/*` | אין לנו קופות פיזיות | אם נוסיף POS |
| `Reports/*` | יש לנו דוחות משלנו | לreconciliation |
| `Invoice+ Documents/*` | `initial_invoice: true` עושה הכל | אם נצטרך לפתוח חשבונית ידנית |
| `Cashiers/*` | יש cashier_uid אחד מוגדר ב-env | אם נוסיף ניהול cashiers |
| `Dictionary/*` | יש לנו mapping סטטי בקוד | אם נרצה רשימה דינמית |
| `Tokens/Add`, `Tokens/Update` | tokenization עובדת דרך payment page | אם נצטרך API ישיר |

---

## 13. קישורים חיצוניים

- API docs: <https://docs.payplus.co.il/reference/introduction>
- Validate Requests: <https://docs.payplus.co.il/reference/validate-requests-received-from-payplus>
- Sandbox: <https://restapidev.payplus.co.il/api/v1.0/>
- Production: <https://restapi.payplus.co.il/api/v1.0/>
- תמיכה: tech@payplus.co.il
