1. Customer starts checkout (Card or PromptPay)

  - App collects fullName + email.
  - Server creates Beam charge and gets chargeId + referenceId.

  2. App sends metadata webhook to your n8n (cus-create-charge)

  - Event: checkout.metadata.created
  - Contains: chargeId, referenceId, productSlug, fullName, email, amount, currency, payment method.
  - n8n stores/upserts this in NocoDB as PENDING.

  3. Customer completes payment at Beam/bank app

  - Beam sends charge.succeeded webhook (server-to-server) to your Beam webhook workflow.
  - This does not depend on customer returning to browser.

  4. n8n merges and fulfills

  - Beam webhook workflow finds row by chargeId (fallback referenceId) in NocoDB.
  - Merge Beam data + stored customer metadata.
  - Idempotency check (process each chargeId once).
  - Mark row SUCCEEDED, set paidAt, run fulfillment automation.

  5. Customer return page behavior

  - If they come back and status is success, app still redirects/shows success page.
  - Success page is now UX only, not your source of automation truth.

  So:

  - App webhook = “create pending metadata record”
  - Beam webhook = “confirm payment + trigger actual fulfillment”