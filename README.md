# RazCrypto Checkout (`checkout.js`)

A browser checkout window for your website. It is served from `https://razcryptogateway.com/v1/checkout.js`. It is also published on npm as **`@razcrypto/checkout`**.
License: MIT. Size: about 3 KB gzip.

## Script tag

```html
<script src="https://razcryptogateway.com/v1/checkout.js"></script>
<script>
  // 1. Your server creates the payment (secret key) and returns its id.
  // 2. Open checkout with your publishable key:
  RazCrypto.open({
    key: 'pk_test_...',
    payment_id: 'pay_...',
    onSuccess(res) { /* send res to your server and verify res.signature there */ },
    onPending(res) { /* paid, waiting for confirmations */ },
    onClose() { /* customer closed the window without paying */ },
    onError(err) { console.error(err.code, err.message); },
  });
</script>
```

To pin a version with Subresource Integrity, load `/v1/checkout.1.0.4.js` instead. Add
`integrity="<value of /v1/checkout.1.0.4.js.sri>" crossorigin="anonymous"`. The unversioned `/v1/checkout.js`
always serves the latest 1.x, so it cannot carry an integrity hash.

Instead of `key` + `payment_id` you can pass the `checkout_url` your server got when it created the payment.

**Host:** checkout opens on `https://razcryptogateway.com` — also from the npm package or a bundled copy. Only for
staging or a self-hosted gateway, pass `payHost` to `open()` or put `data-pay-host="https://…"` on the `<script>` or
button (a script loaded from that gateway's own `/v1/checkout.js` uses it automatically).

**Pay buttons (no code):** `<button data-razcrypto-button="BUTTON_ID">Pay</button>`. You can also call
`RazCrypto.openButton({ button: 'BUTTON_ID' })`.

## What the customer sees

- **Desktop:** a two-column window (your brand and amount on the left, steps on the right). Nothing needs scrolling.
- **Phone:** a full-screen window with your brand header and a sticky action bar.
- **Steps:** pick a network (dropdown), then pick a coin, then scan the QR or copy the amount and address.
  - With only one network, that step is skipped.
  - With only one network and one coin, the QR shows straight away.
- **No contact form.** Your site already knows the customer. Name, email and mobile are asked only on payment
  links and Pay buttons, and only if you turned them on for that link.
- **On success:**
  1. The whole window turns green with an animation.
  2. `onSuccess` runs.
  3. About 2.6 seconds later the window closes by itself. `onClose` is *not* called after a success.

## Fast opening

When the script loads, it warms up checkout once, when the page is idle:
- it opens a connection to the pay host
- it loads a hidden 1×1 `/embed/warm` page so checkout's code is already cached

When `open()` is called, the window appears instantly with a "secure checkout" splash. The splash switches to the
payment as soon as it is ready.

- **Opt out:** add `<script … data-preload="false">`.
- **npm bundle:** call `preload()` yourself (for example on page load, or on hover of your pay button).

```js
import { open, preload } from '@razcrypto/checkout';
preload();
open({ key: 'pk_test_...', payment_id: 'pay_...', onSuccess(res) { /* verify on your server */ } });
```

## Security

- Verify `res.signature` **on your server** with a server SDK (`verifyCheckoutSignature`).
- Only publishable keys (`pk_…`) belong in the browser. `open()` refuses secret keys.
- Messages are accepted only from the pay origin and only from our iframe. The iframe sends status messages only
  to the page that opened it.
- Esc asks the customer to confirm before closing an unfinished payment.
