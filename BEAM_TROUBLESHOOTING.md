# Beam Checkout Card Payment Troubleshooting

## Current Error
```
400 Bad Request: inputs are failing validation; payment method is not supported
```

## Merchant Details
- Merchant ID: `dsp`
- Environment: `playground`
- API Base: `https://playground.api.beamcheckout.com/api/v1`

## Current Implementation
Located in `src/routes/[slug]/+page.server.ts:143-156`

Current structure:
```json
{
  "amount": 10000,
  "currency": "THB",
  "paymentMethod": {
    "paymentMethodType": "CARD_TOKEN",
    "cardToken": {
      "cardTokenId": "tok_xxx",
      "securityCode": "123"
    }
  },
  "referenceId": "order_xxx",
  "returnUrl": "https://..."
}
```

## Possible Root Causes

### 1. Merchant Not Enabled for CARD_TOKEN (MOST LIKELY)
The playground merchant `dsp` may not have `CARD_TOKEN` payment method enabled.

**Solution**: Contact Beam support to enable `CARD_TOKEN` for merchant `dsp` in playground environment.

### 2. Wrong JSON Structure
The Beam documentation does NOT show the exact structure for using card tokens.

**Alternative structures to try**:

#### Structure A: Flat (no nested cardToken object)
```json
{
  "amount": 10000,
  "currency": "THB",
  "paymentMethod": {
    "paymentMethodType": "CARD_TOKEN",
    "cardTokenId": "tok_xxx",
    "securityCode": "123"
  },
  "referenceId": "order_xxx",
  "returnUrl": "https://..."
}
```

#### Structure B: Different field name (token instead of cardTokenId)
```json
{
  "amount": 10000,
  "currency": "THB",
  "paymentMethod": {
    "paymentMethodType": "CARD_TOKEN",
    "token": "tok_xxx",
    "securityCode": "123"
  },
  "referenceId": "order_xxx",
  "returnUrl": "https://..."
}
```

#### Structure C: Use CARD with token reference
```json
{
  "amount": 10000,
  "currency": "THB",
  "paymentMethod": {
    "paymentMethodType": "CARD",
    "cardToken": "tok_xxx",
    "securityCode": "123"
  },
  "referenceId": "order_xxx",
  "returnUrl": "https://..."
}
```

## Temporary Workaround: Use Raw CARD Payment

If you need payments working immediately, you can temporarily use raw card data (but this reduces PCI compliance benefits).

In `src/routes/[slug]/+page.server.ts`, change the paymentMethod to:

```typescript
paymentMethod: {
  paymentMethodType: 'CARD',
  card: {
    pan: cardNumber,  // You'd need to pass this from frontend
    cardHolderName: cardHolderName,
    expiryMonth: expiryMonth,
    expiryYear: expiryYear,
    securityCode: securityCode
  }
}
```

**WARNING**: This approach passes full card details through your server, reducing PCI compliance benefits. Only use as a temporary workaround.

## Next Steps

1. **Contact Beam Support** - Email support@beamcheckout.com or use their merchant dashboard support
   - Ask: "What is the correct JSON structure for using CARD_TOKEN payment method?"
   - Ask: "Is CARD_TOKEN enabled for playground merchant 'dsp'?"
   - Request: Example API request showing tokenized card payment

2. **Test Alternative Structures** - Try the structures A, B, C above

3. **Check Merchant Dashboard** - Log into Beam merchant dashboard and verify:
   - Payment methods enabled for your account
   - API credentials are correct
   - No restrictions on playground environment

## Documentation References

- [Beam Charges API](https://docs.beamcheckout.com/charges/charges-api) - Lists CARD_TOKEN as supported
- [Card Tokenization](https://docs.beamcheckout.com/charges/card-tokenization) - Shows token creation, NOT usage
- [Charges Integration Guide](https://docs.beamcheckout.com/charges/charges-integration) - General integration guide

## Current Code Locations

- Server-side Beam integration: `src/lib/server/beam.ts`
- Payment action handler: `src/routes/[slug]/+page.server.ts:90-207`
- Frontend tokenization: `src/routes/[slug]/+page.svelte:125-158`
- Type definitions: `src/lib/server/beam.ts:59-65`
