# Beam Payment Acceptance Guide (Card + PromptPay)

This guide explains, step by step, how this project accepts card and PromptPay payments with Beam. It is written for AI agents so they can confidently perform the flow end-to-end, wire the right APIs, and know where to look when something breaks.

---

## System Map (what pieces exist)
- **Frontend (`frontend/`)**: Vanilla JS modal checkout (`frontend/app.js`) that calls the backend, renders QR codes, handles 3DS redirects, and polls status.
- **Backend (`backend/`)**: Express server exposing payment routes (`backend/routes/payment.js`), webhook handler (`backend/routes/webhook.js`), and Beam API client (`backend/services/beam.js`).
- **Beam**: External gateway for card + PromptPay. We hit `POST /api/v1/charges` for both methods. Optional Beam payment links are available but not used in the default UI.
- **n8n (optional)**: Receives success notifications (queued in `backend/services/task-queue.js`) after verified webhooks.
- **Product catalog**: `backend/data/products.json` provides price, currency (THB), success URL, and product-level webhook override.

---

## Prerequisites and Environment
1. **Credentials from Beam Lighthouse**
   - `BEAM_MERCHANT_ID`
   - `BEAM_API_KEY`
   - `BEAM_WEBHOOK_SECRET` (base64 key for HMAC verification)
   - `BEAM_ENVIRONMENT` (`production` or `playground`)
2. **Backend `.env`** (use `backend/.env.example` as template):
   - Beam: `BEAM_MERCHANT_ID`, `BEAM_API_KEY`, `BEAM_WEBHOOK_SECRET`, `BEAM_ENVIRONMENT`
   - Server: `PORT` (default 3000), `NODE_ENV`
   - n8n: `N8N_WEBHOOK_URL` (required for notification delivery)
   - Frontend: `FRONTEND_URL`, `SUCCESS_URL`
3. **Start services locally**
   ```bash
   # Backend
   cd backend
   npm install
   npm start  # starts http://localhost:3000

   # Frontend (simple static server)
   cd ../frontend
   python3 server.py  # serves http://localhost:8000
   ```

---

## Core API Contract (backend)

### 1) Create charge — `POST /api/create-charge`
Payload (JSON):
```json
{
  "name": "Customer Name",
  "email": "user@example.com",
  "paymentMethod": "CARD",            // or "QR_PROMPT_PAY"
  "amount": 59900,                    // satang; always THB
  "currency": "THB",
  "productId": "n8n-newbie",
  "cardData": {                       // required only for CARD
    "cardNumber": "4242 4242 4242 4242",
    "cardHolderName": "CUSTOMER NAME",
    "expiryMonth": 12,
    "expiryYear": 2026,
    "securityCode": "123"
  }
}
```
Response:
```json
{
  "chargeId": "<beam-charge-id>",
  "referenceId": "<internal-ref>",
  "paymentUrl": "<3ds or hosted url if Beam requires redirect>",   // only when Beam says action required
  "qrCodeUrl": "data:image/png;base64,..."                         // only for QR_PROMPT_PAY
}
```
Behavior:
- Validates name, email, amount, currency, payment method, and card data (`backend/utils/validation.js`).
- Calls Beam `POST /api/v1/charges` with `paymentMethodType` set to `CARD` or `QR_PROMPT_PAY`.
- Embeds `productId` inside `referenceId` so webhooks can resolve product metadata even on cold start.
- Stores a lightweight record in `chargeStorage` for polling and webhook enrichment.

### 2) Check status — `GET /api/payment-status/:chargeId`
Response:
```json
{
  "chargeId": "<id>",
  "status": "PENDING|SUCCEEDED|PAID|COMPLETED|FAILED|EXPIRED",
  "amount": 59900,
  "currency": "THB"
}
```
Behavior:
- For normal charges, hits Beam `GET /api/v1/charges/{id}`.
- Interprets `SUCCEEDED|PAID|COMPLETED` as success; `FAILED|EXPIRED` as failure; anything else keeps polling.

### 3) Webhook — `POST /api/webhook/beam`
- Requires header `x-beam-signature` (HMAC SHA-256, base64, using `BEAM_WEBHOOK_SECRET`) and `x-beam-event`.
- Accepts both `chargeId` and `paymentLinkId`.
- Success events are any of: status `SUCCEEDED|PAID|COMPLETED` or event name containing `SUCCEEDED/PAID/COMPLETED`.
- On success: marks local charge as `SUCCEEDED`, enriches with stored name/email, and sends to n8n (product-specific webhook override supported).
- Idempotency: keeps a `processedWebhooks` map to drop duplicates and still returns 200 to Beam.

---

## Frontend Flow (what the AI should do)

### Shared setup
1. Load product: `GET /api/products/:productId` to fetch amount, currency, success URL, and image (see `backend/routes/payment.js`).
2. Collect payer info (name + email) and validate with frontend helpers (`frontend/app.js` `validation.*`).
3. Open the modal and let the user pick Card or PromptPay (or auto-PromptPay for products in `PROMPTPAY_ONLY_PRODUCTS`).

### Card acceptance flow
1. Gather card details (`cardNumber`, `cardHolderName`, `expiryMonth`, `expiryYear`, `securityCode`), run Luhn + expiry + CVV checks (`validation.validateCardForm()`).
2. Call `POST /api/create-charge` with `paymentMethod: "CARD"` and `cardData` populated.
3. Store `chargeId` from the response.
4. If `paymentUrl` exists, open it in a new window (Beam 3DS/hosted) and monitor for the window being closed.
5. Start polling `/api/payment-status/:chargeId` every 3s (CONFIG.CARD.POLL_INTERVAL_MS).
6. Success statuses (`SUCCEEDED|PAID|COMPLETED`): stop polling, close popup, show success modal, redirect to `product.successUrl`.
7. Failure (`FAILED|EXPIRED` or popup closed early): stop polling, show error modal, let the user retry.

### PromptPay acceptance flow
1. Call `POST /api/create-charge` with `paymentMethod: "QR_PROMPT_PAY"`.
2. Render `qrCodeUrl` returned by the backend.
3. Start a 15-minute countdown (CONFIG.PROMPTPAY.TIMEOUT) and staged polling:
   - Wait 10s, then poll every 5s for 5 minutes, then every 30s until 15 minutes total.
4. Success statuses: stop polling/timer, show success modal, redirect to `product.successUrl`.
5. Failure/timeout (`FAILED|EXPIRED` or timer hits 0): stop polling/timer, show error, and let the user start over.

---

## Backend Behavior Notes (for troubleshooting or extending)
- **Beam client**: `backend/services/beam.js` builds `Authorization: Basic base64(merchantId:apiKey)` and sends card data only when provided; otherwise Beam can return a redirect for card capture.
- **Product-aware reference**: `referenceId` format `${productId}-order-<timestamp>-<random>` so webhook handlers can rehydrate product metadata if the charge is not in memory.
- **Webhook enrichment**: merges stored name/email into the webhook payload before forwarding to n8n so downstream automations have customer data.
- **Rate limits**: `paymentLimiter` and `webhookLimiter` protect the endpoints.
- **Security**: card data is never logged; webhook signature is timing-safe compared; only `THB` currency is accepted.

---

## Minimal AI Playbook (do exactly this)
1. Ensure `.env` has Beam creds + webhook secret + n8n URL; restart backend.
2. Load product via `/api/products/:id`; stash `amount`, `currency`, `successUrl`, `productId`.
3. When user picks **Card**, validate inputs, call `/api/create-charge` with `cardData`, open `paymentUrl` if present, poll status every 3s, redirect on success.
4. When user picks **PromptPay**, call `/api/create-charge` with `paymentMethod: QR_PROMPT_PAY`, show `qrCodeUrl`, run the staged poller, redirect on success.
5. Rely on `/api/payment-status/:chargeId` for live updates; rely on `/api/webhook/beam` + n8n for backend notifications/fulfillment.
6. Treat `SUCCEEDED|PAID|COMPLETED` as success; `FAILED|EXPIRED` as failure; anything else keep waiting within the configured timeout.

---

## Quick Testing Recipes
- **Health check**: `curl http://localhost:3000/api/health`
- **Create PromptPay charge**:
  ```bash
  curl -X POST http://localhost:3000/api/create-charge \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Test User",
      "email": "test@example.com",
      "paymentMethod": "QR_PROMPT_PAY",
      "amount": 1000,
      "currency": "THB",
      "productId": "demo-payment"
    }'
  ```
- **Create Card charge** (use a Beam playground test card from Lighthouse):
  ```bash
  curl -X POST http://localhost:3000/api/create-charge \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Test User",
      "email": "test@example.com",
      "paymentMethod": "CARD",
      "amount": 1000,
      "currency": "THB",
      "productId": "demo-payment",
      "cardData": {
        "cardNumber": "4242 4242 4242 4242",
        "cardHolderName": "TEST USER",
        "expiryMonth": 12,
        "expiryYear": 2026,
        "securityCode": "123"
      }
    }'
  ```
- **Poll status**: `curl http://localhost:3000/api/payment-status/<chargeId>`
- **Simulate webhook (replace signature with a valid HMAC for raw body)**:
  ```bash
  curl -X POST http://localhost:3000/api/webhook/beam \
    -H "Content-Type: application/json" \
    -H "x-beam-signature: <computed_base64_hmac>" \
    -H "x-beam-event: charge.succeeded" \
    -d '{"chargeId":"demo","status":"SUCCEEDED","amount":1000,"currency":"THB"}'
  ```

With these steps and payloads, an AI agent can drive both payment methods, monitor status, and ensure downstream notifications fire correctly.
