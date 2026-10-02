/**
 * @razcrypto/checkout — checkout.js. Opens RazCrypto checkout in a modal on the merchant's page.
 * Script tag: <script src="https://pay.razcryptogateway.com/v1/checkout.js"></script> → window.RazCrypto.
 * Publishable key only. Messages are accepted only from the pay origin and only from our iframe.
 */

export interface CheckoutResult {
  payment_id: string;
  reference_id: string | null;
  status: string;
  /** hex HMAC-SHA256(signing secret, payment_id|reference_id|status) — verify on your server. */
  signature?: string;
}

export interface CheckoutError {
  code: string;
  message: string;
}

export interface CheckoutOptions {
  /** Publishable key (pk_live_… / pk_test_…). Never a secret key. Not needed with `checkout_url`. */
  key?: string;
  /** Payment created on your server (`pay_…`). Not needed with `checkout_url`. */
  payment_id?: string;
  /** Alternative to key + payment_id: the `checkout_url` your server got when creating the payment. */
  checkout_url?: string;
  onSuccess?(res: CheckoutResult): void;
  onPending?(res: { payment_id: string; status: string }): void;
  onClose?(): void;
  onError?(err: CheckoutError): void;
  locale?: 'en' | 'hi';
  /** Self-hosters only. Default: the origin this script was loaded from. */
  payHost?: string;
}

export interface ButtonOptions {
  /** Payment button id (the link slug from your dashboard). */
  button: string;
  /** Optional; accepted for symmetry with open(). */
  key?: string;
  onSuccess?(res: CheckoutResult): void;
  onClose?(): void;
  onError?(err: CheckoutError): void;
  locale?: 'en' | 'hi';
  payHost?: string;
}

export interface CheckoutHandle {
  close(): void;
}

const DEFAULT_HOST = 'https://pay.razcryptogateway.com';
const PAY_ID = /^pay_[0-9A-Za-z]{20}$/;
const SLUG = /^[0-9A-Za-z]{6,40}$/;

/** Where this script was served from — so self-hosted copies talk to their own host. */
function scriptHost(): string | null {
  if (typeof document === 'undefined') return null;
  const s = document.currentScript as HTMLScriptElement | null;
  if (s?.src) {
    try {
      return new URL(s.src).origin;
    } catch {
      return null;
    }
  }
  return null;
}
const LOADED_FROM = scriptHost();

let active: { close: (notify: boolean) => void } | null = null;

function fail(onError: ((e: CheckoutError) => void) | undefined, code: string, message: string): CheckoutHandle {
  if (onError) onError({ code, message });
  else if (typeof console !== 'undefined') console.error(`[RazCrypto] ${code}: ${message}`);
  return { close() {} };
}

function mount(src: string, payOrigin: string, handlers: { onSuccess?: (r: CheckoutResult) => void; onPending?: (r: { payment_id: string; status: string }) => void; onClose?: () => void }): CheckoutHandle {
  active?.close(false);
  const doc = document;
  const prevOverflow = doc.documentElement.style.overflow;
  const overlay = doc.createElement('div');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Crypto checkout');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:rgba(15,15,20,.55);backdrop-filter:blur(2px);opacity:0;transition:opacity .2s ease';
  const frame = doc.createElement('iframe');
  frame.src = src;
  frame.title = 'Crypto checkout';
  frame.allow = 'clipboard-write';
  const small = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 520px)').matches;
  frame.style.cssText = small
    ? 'border:0;width:100%;height:100%;background:transparent'
    : 'border:0;width:440px;max-width:calc(100vw - 32px);height:min(760px,calc(100vh - 48px));border-radius:24px;background:transparent;box-shadow:0 24px 64px rgba(0,0,0,.35)';
  overlay.appendChild(frame);
  doc.body.appendChild(overlay);
  doc.documentElement.style.overflow = 'hidden';
  requestAnimationFrame(() => (overlay.style.opacity = '1'));

  const onMessage = (e: MessageEvent) => {
    if (e.origin !== payOrigin || e.source !== frame.contentWindow) return;
    const d = e.data as { source?: string; type?: string; payload?: Record<string, unknown> } | null;
    if (!d || d.source !== 'razcrypto') return;
    if (d.type === 'success') handlers.onSuccess?.(d.payload as unknown as CheckoutResult);
    else if (d.type === 'status' && d.payload?.status === 'confirming') handlers.onPending?.(d.payload as { payment_id: string; status: string });
    else if (d.type === 'close') close(true);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') frame.contentWindow?.postMessage({ source: 'razcrypto-parent', type: 'request_close' }, payOrigin);
  };
  window.addEventListener('message', onMessage);
  window.addEventListener('keydown', onKey);

  function close(notify: boolean) {
    window.removeEventListener('message', onMessage);
    window.removeEventListener('keydown', onKey);
    overlay.remove();
    doc.documentElement.style.overflow = prevOverflow;
    if (active?.close === close) active = null;
    if (notify) handlers.onClose?.();
  }
  active = { close };
  return { close: () => close(true) };
}

function hostOf(opt?: string): string {
  try {
    return new URL(opt ?? LOADED_FROM ?? DEFAULT_HOST).origin;
  } catch {
    return DEFAULT_HOST;
  }
}

/** Open checkout for a payment your server created. */
export function open(options: CheckoutOptions): CheckoutHandle {
  if (typeof window === 'undefined') return fail(options?.onError, 'browser_only', 'RazCrypto.open() runs in the browser');
  if (options?.checkout_url) {
    let u: URL;
    try {
      u = new URL(options.checkout_url);
    } catch {
      return fail(options.onError, 'invalid_checkout_url', 'checkout_url is not a valid URL');
    }
    const id = u.pathname.split('/').filter(Boolean).pop() ?? '';
    const t = u.searchParams.get('t');
    if (!PAY_ID.test(id) || !t) return fail(options.onError, 'invalid_checkout_url', 'checkout_url must be the URL returned when the payment was created');
    const q = new URLSearchParams({ t, origin: window.location.origin });
    if (options.locale) q.set('locale', options.locale);
    return mount(`${u.origin}/embed/${id}?${q}`, u.origin, options);
  }
  if (typeof options?.key !== 'string' || !/^pk_(live|test)_/.test(options.key)) {
    return fail(options?.onError, 'invalid_key', 'Pass your publishable key (pk_live_… or pk_test_…). Never use a secret key in the browser.');
  }
  if (!PAY_ID.test(options.payment_id ?? '')) return fail(options.onError, 'invalid_payment_id', 'payment_id must look like pay_…');
  const host = hostOf(options.payHost);
  const q = new URLSearchParams({ key: options.key, origin: window.location.origin });
  if (options.locale) q.set('locale', options.locale);
  return mount(`${host}/embed/${options.payment_id}?${q}`, host, options);
}

/** Open a Pay button (static websites): customer enters details, then pays in the same window. */
export function openButton(options: ButtonOptions): CheckoutHandle {
  if (typeof window === 'undefined') return fail(options?.onError, 'browser_only', 'RazCrypto.openButton() runs in the browser');
  if (!options || !SLUG.test(options.button)) return fail(options?.onError, 'invalid_button', 'button must be the id shown in your dashboard');
  const host = hostOf(options.payHost);
  const q = new URLSearchParams({ embed: '1', origin: window.location.origin });
  return mount(`${host}/l/${options.button}?${q}`, host, options);
}

/** Auto-wire `<button data-razcrypto-button="SLUG">` elements (no JavaScript needed on the page). */
export function bindButtons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-razcrypto-button]').forEach((el) => {
    if (el.dataset.razcryptoBound) return;
    el.dataset.razcryptoBound = '1';
    el.addEventListener('click', (e) => {
      e.preventDefault();
      openButton({ button: el.dataset.razcryptoButton ?? '' });
    });
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => bindButtons());
  else bindButtons();
}
