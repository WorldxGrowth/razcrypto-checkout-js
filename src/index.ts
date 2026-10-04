/**
 * @razcrypto/checkout — checkout.js. Opens RazCrypto checkout in a modal on the merchant's page.
 * Script tag: <script src="https://YOUR-GATEWAY/v1/checkout.js"></script> → window.RazCrypto.
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

export interface PreloadOptions {
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

const PAY_ID = /^pay_[0-9A-Za-z]{20}$/;
const SLUG = /^[0-9A-Za-z]{6,40}$/;

/** Official RazCrypto checkout host. */
export const DEFAULT_PAY_HOST = 'https://razcryptogateway.com';

/** A gateway serving its own `/v1/checkout.js` (staging, self-hosted) — the script then uses that host. */
function scriptHost(): string | null {
  if (typeof document === 'undefined') return null;
  const s = document.currentScript as HTMLScriptElement | null;
  if (!s?.src) return null;
  try {
    const u = new URL(s.src);
    return /\/v1\/checkout(\.\d+\.\d+\.\d+)?\.js$/.test(u.pathname) ? u.origin : null;
  } catch {
    return null;
  }
}
/**
 * Pay host, in this order: `payHost` option → `data-pay-host` (script or button) → the gateway the script was
 * loaded from (`…/v1/checkout.js`) → the official host. Bundled copies (npm, WordPress plugin) use the official host.
 */
const SCRIPT_PAY_HOST = typeof document === 'undefined' ? null : ((document.currentScript as HTMLScriptElement | null)?.dataset.payHost ?? null);
const SCRIPT_TAG_HOST = SCRIPT_PAY_HOST ?? scriptHost(); // set only when loaded with a <script> tag
const LOADED_FROM = SCRIPT_TAG_HOST ?? DEFAULT_PAY_HOST;
const PRELOAD = typeof document === 'undefined' || (document.currentScript as HTMLScriptElement | null)?.dataset.preload !== 'false';

let active: { close: (notify: boolean) => void } | null = null;

function fail(onError: ((e: CheckoutError) => void) | undefined, code: string, message: string): CheckoutHandle {
  if (onError) onError({ code, message });
  else if (typeof console !== 'undefined') console.error(`[RazCrypto] ${code}: ${message}`);
  return { close() {} };
}

const SPLASH_SVG =
  '<svg viewBox="0 0 64 72" width="72" height="80" aria-hidden="true"><defs><linearGradient id="rzg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b7cfa"/><stop offset="1" stop-color="#2140c9"/></linearGradient></defs><path d="M32 2 60 12v22c0 18-12 30-28 36C16 64 4 52 4 34V12Z" fill="url(#rzg)"/><path d="m21 36 8 8 15-16" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function injectStyles(doc: Document): void {
  if (doc.getElementById('razcrypto-css')) return;
  const st = doc.createElement('style');
  st.id = 'razcrypto-css';
  st.textContent =
    '@keyframes rzc-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.92);opacity:.75}}' +
    '@keyframes rzc-in{from{transform:translateY(16px) scale(.98);opacity:0}to{transform:none;opacity:1}}' +
    '.rzc-box{position:relative;overflow:hidden;background:#f4f5f7;animation:rzc-in .28s cubic-bezier(.2,.7,.2,1) both}' +
    '.rzc-splash{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;transition:opacity .25s ease;font:500 13px system-ui,sans-serif;color:#6b7280}' +
    '.rzc-splash svg{animation:rzc-pulse 1.2s ease-in-out infinite}' +
    // Splash animation plays even with reduced motion: it is short and is the brand/safety moment (D-110).
    '@media (prefers-color-scheme:dark){.rzc-box{background:#14161b}.rzc-splash{color:#9ca3af}}';
  doc.head.appendChild(st);
}

/** Warm the pay host once per page (DNS/TLS + the checkout window's code), so open() feels instant. */
let warmed = false;
function warm(host: string): void {
  if (warmed || typeof document === 'undefined') return;
  warmed = true;
  const doc = document;
  const pre = doc.createElement('link');
  pre.rel = 'preconnect';
  pre.href = host;
  doc.head.appendChild(pre);
  // Cache the platform logo now so the splash shows it on the first frame.
  new Image().src = `${host}/v1/brand-logo`;
  const idle = (cb: () => void) => ('requestIdleCallback' in window ? (window as unknown as { requestIdleCallback(c: () => void, o: { timeout: number }): void }).requestIdleCallback(cb, { timeout: 4000 }) : setTimeout(cb, 1500));
  idle(() => {
    const f = doc.createElement('iframe');
    f.src = `${host}/embed/warm`;
    f.title = '';
    f.setAttribute('aria-hidden', 'true');
    f.tabIndex = -1;
    f.style.cssText = 'position:absolute;width:1px;height:1px;left:-9999px;top:0;border:0;opacity:0;pointer-events:none';
    f.onload = () => setTimeout(() => f.remove(), 3000);
    doc.body.appendChild(f);
  });
}

function mount(src: string, payOrigin: string, handlers: { onSuccess?: (r: CheckoutResult) => void; onPending?: (r: { payment_id: string; status: string }) => void; onClose?: () => void }): CheckoutHandle {
  active?.close(false);
  const doc = document;
  injectStyles(doc);
  const prevOverflow = doc.documentElement.style.overflow;
  const overlay = doc.createElement('div');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Crypto checkout');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:rgba(15,15,20,.6);backdrop-filter:blur(3px);opacity:0;transition:opacity .2s ease';
  const small = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches;
  // The window appears instantly with a splash; the iframe fades in when it reports "ready".
  const box = doc.createElement('div');
  box.className = 'rzc-box';
  box.style.cssText = small ? 'width:100%;height:100%' : 'width:880px;max-width:calc(100vw - 32px);height:min(600px,calc(100vh - 32px));border-radius:20px;box-shadow:0 24px 64px rgba(0,0,0,.35)';
  const splash = doc.createElement('div');
  splash.className = 'rzc-splash';
  splash.innerHTML = '<span>Secure crypto checkout</span>';
  // The platform's logo (Admin → Branding; preloaded by warm()). The shield is only the fallback when there is
  // no logo (404) — not a placeholder, so the brand is what people see first.
  const logo = doc.createElement('img');
  logo.alt = '';
  logo.width = 80;
  logo.height = 80;
  logo.style.cssText = 'width:80px;height:80px;object-fit:contain;border-radius:18px;opacity:0;transition:opacity .15s ease;animation:rzc-pulse 1.2s ease-in-out infinite';
  logo.onload = () => (logo.style.opacity = '1');
  logo.onerror = () => {
    logo.remove();
    splash.insertAdjacentHTML('afterbegin', SPLASH_SVG);
  };
  logo.src = `${payOrigin}/v1/brand-logo`;
  splash.prepend(logo);
  const frame = doc.createElement('iframe');
  frame.src = src;
  frame.title = 'Crypto checkout';
  frame.allow = 'clipboard-write';
  frame.style.cssText = 'position:absolute;inset:0;border:0;width:100%;height:100%;background:transparent;opacity:0;transition:opacity .25s ease';
  box.append(splash, frame);
  overlay.appendChild(box);
  doc.body.appendChild(overlay);
  doc.documentElement.style.overflow = 'hidden';
  requestAnimationFrame(() => (overlay.style.opacity = '1'));

  const reveal = () => {
    frame.style.opacity = '1';
    splash.style.opacity = '0';
    setTimeout(() => splash.remove(), 300);
  };
  const fallback = setTimeout(reveal, 8000);

  const onMessage = (e: MessageEvent) => {
    if (e.origin !== payOrigin || e.source !== frame.contentWindow) return;
    const d = e.data as { source?: string; type?: string; payload?: Record<string, unknown> } | null;
    if (!d || d.source !== 'razcrypto') return;
    if (d.type === 'ready') {
      clearTimeout(fallback);
      reveal();
    } else if (d.type === 'success') handlers.onSuccess?.(d.payload as unknown as CheckoutResult);
    else if (d.type === 'status' && d.payload?.status === 'confirming') handlers.onPending?.(d.payload as { payment_id: string; status: string });
    // Paid: the success animation has played — close quietly (onSuccess already ran, so no onClose).
    else if (d.type === 'done') close(false, true);
    else if (d.type === 'close') close(true);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') frame.contentWindow?.postMessage({ source: 'razcrypto-parent', type: 'request_close' }, payOrigin);
  };
  window.addEventListener('message', onMessage);
  window.addEventListener('keydown', onKey);

  function close(notify: boolean, animate = false) {
    clearTimeout(fallback);
    window.removeEventListener('message', onMessage);
    window.removeEventListener('keydown', onKey);
    const finish = () => {
      overlay.remove();
      doc.documentElement.style.overflow = prevOverflow;
    };
    if (animate) {
      overlay.style.opacity = '0';
      setTimeout(finish, 220);
    } else finish();
    if (active?.close === close) active = null;
    if (notify) handlers.onClose?.();
  }
  active = { close };
  return { close: () => close(true) };
}

function hostOf(opt?: string): string | null {
  try {
    const h = opt ?? LOADED_FROM;
    return h ? new URL(h).origin : null;
  } catch {
    return null;
  }
}
const NO_HOST = 'payHost must be an http(s) URL.';

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
  if (!host) return fail(options.onError, 'pay_host_missing', NO_HOST);
  const q = new URLSearchParams({ key: options.key, origin: window.location.origin });
  if (options.locale) q.set('locale', options.locale);
  return mount(`${host}/embed/${options.payment_id}?${q}`, host, options);
}

/** Open a Pay button (static websites): customer enters details, then pays in the same window. */
export function openButton(options: ButtonOptions): CheckoutHandle {
  if (typeof window === 'undefined') return fail(options?.onError, 'browser_only', 'RazCrypto.openButton() runs in the browser');
  if (!options || !SLUG.test(options.button)) return fail(options?.onError, 'invalid_button', 'button must be the id shown in your dashboard');
  const host = hostOf(options.payHost);
  if (!host) return fail(options.onError, 'pay_host_missing', NO_HOST);
  const q = new URLSearchParams({ embed: '1', origin: window.location.origin });
  return mount(`${host}/l/${options.button}?${q}`, host, options);
}

/**
 * Warm up checkout (connection + code) so open() shows the payment instantly. Called automatically when the
 * script loads; call it yourself after loading the script dynamically. Safe to call more than once.
 */
export function preload(options: PreloadOptions = {}): void {
  if (typeof window === 'undefined') return;
  const host = hostOf(options.payHost);
  if (host) warm(host);
}

/** Auto-wire `<button data-razcrypto-button="SLUG">` elements (no JavaScript needed on the page). */
export function bindButtons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-razcrypto-button]').forEach((el) => {
    if (el.dataset.razcryptoBound) return;
    el.dataset.razcryptoBound = '1';
    el.addEventListener('click', (e) => {
      e.preventDefault();
      openButton({ button: el.dataset.razcryptoButton ?? '', ...(el.dataset.payHost && { payHost: el.dataset.payHost }) });
    });
  });
}

if (typeof document !== 'undefined') {
  const boot = () => {
    bindButtons();
    // Script-tag installs warm up automatically; opt out with data-preload="false" on the <script>.
    if (SCRIPT_TAG_HOST && PRELOAD) preload(); // npm bundles call preload() themselves
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
