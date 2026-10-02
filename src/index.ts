// @razcrypto/checkout: placeholder. Not implemented yet; see ../README.md and ../../README.md §4.
// Public surface (planned): open(options) -> { close() }; IIFE build exposes window.RazCrypto.

export interface CheckoutResult {
  payment_id: string;
  reference_id: string | null;
  status: 'paid' | 'confirming';
  signature: string;
}

export interface CheckoutError {
  code: 'invalid_key' | 'payment_not_found' | 'payment_expired' | 'network_error' | string;
  message: string;
}

export interface CheckoutOptions {
  /** Publishable key (pk_live_... / pk_test_...). Never a secret key. */
  key: string;
  /** Payment created on the merchant server. */
  payment_id: string;
  onSuccess?(res: CheckoutResult): void;
  onPending?(res: CheckoutResult): void;
  onClose?(): void;
  onError?(err: CheckoutError): void;
  theme?: { mode?: 'auto' | 'light' | 'dark'; accent?: string };
  locale?: 'en' | 'hi';
  /** Self-hosters only. Default https://pay.razcryptogateway.com */
  payHost?: string;
}

export interface CheckoutHandle {
  close(): void;
}

export function open(_options: CheckoutOptions): CheckoutHandle {
  throw new Error('@razcrypto/checkout is not implemented yet');
}
