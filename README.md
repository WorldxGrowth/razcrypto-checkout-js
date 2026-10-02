# RazCrypto Checkout (`checkout.js`)

A browser checkout modal. It is served from `https://pay.razcryptogateway.com/v1/checkout.js` and
published on npm as **`@razcrypto/checkout`**. License: MIT.

Status: **placeholder (0.0.0, private)**. `src/index.ts` holds only the planned public types. The
iframe/postMessage bridge, the modal UX, the IIFE + ESM build and the size budget (< 10 KB gzip) are
specified in [../README.md](../README.md) §4.

```js
import { open } from '@razcrypto/checkout';
const handle = open({ key: 'pk_test_...', payment_id: 'pay_...', onSuccess(res) { /* verify on your server */ } });
```

Verify `res.signature` **on your server** with a server SDK (`verifyCheckoutSignature`). Never put a
secret key in the browser.
