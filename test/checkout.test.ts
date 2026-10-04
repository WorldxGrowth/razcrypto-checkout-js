// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindButtons, open, openButton, preload } from '../src/index';

const PAY = 'https://pay.example';
const frame = () => document.querySelector<HTMLIFrameElement>('.rzc-box iframe');
afterEach(() => {
  document.body.innerHTML = '';
});

function fromFrame(data: unknown, origin = PAY) {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source: frame()!.contentWindow }));
}

describe('checkout.js', () => {
  it('refuses secret keys and bad ids without opening anything', () => {
    const onError = vi.fn();
    open({ key: 'sk_live_abc', payment_id: 'pay_3fK9sQ2mZt7LxR1aPq0B', onError });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'invalid_key' }));
    open({ key: 'pk_test_abc', payment_id: 'nope', onError });
    expect(onError).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'invalid_payment_id' }));
    expect(frame()).toBeNull();
  });

  it('opens the embed with key + parent origin; success only from the pay origin and our iframe', () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    const h = open({ key: 'pk_test_abc', payment_id: 'pay_3fK9sQ2mZt7LxR1aPq0B', payHost: PAY, onSuccess, onClose });
    const src = new URL(frame()!.src);
    expect(src.origin + src.pathname).toBe(`${PAY}/embed/pay_3fK9sQ2mZt7LxR1aPq0B`);
    expect(src.searchParams.get('key')).toBe('pk_test_abc');
    expect(src.searchParams.get('origin')).toBe(window.location.origin);

    fromFrame({ source: 'razcrypto', type: 'success', payload: { payment_id: 'x' } }, 'https://evil.example');
    expect(onSuccess).not.toHaveBeenCalled();
    window.dispatchEvent(new MessageEvent('message', { data: { source: 'razcrypto', type: 'success', payload: {} }, origin: PAY, source: window }));
    expect(onSuccess).not.toHaveBeenCalled();
    fromFrame({ source: 'razcrypto', type: 'success', payload: { payment_id: 'pay_3fK9sQ2mZt7LxR1aPq0B', status: 'paid', signature: 'ab' } });
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid' }));

    fromFrame({ source: 'razcrypto', type: 'close' });
    expect(onClose).toHaveBeenCalledOnce();
    expect(frame()).toBeNull();
    h.close(); // idempotent
  });

  it('Pay buttons: openButton and data-razcrypto-button auto-binding', () => {
    openButton({ button: 'O7MTkxHr', payHost: PAY });
    const src = new URL(frame()!.src);
    expect(src.pathname).toBe('/l/O7MTkxHr');
    expect(src.searchParams.get('embed')).toBe('1');
    document.body.innerHTML = `<button data-razcrypto-button="AbCdEf12" data-pay-host="${PAY}">Pay</button>`;
    bindButtons();
    (document.querySelector('button') as HTMLButtonElement).click();
    expect(frame()?.src).toContain('/l/AbCdEf12');
    expect(new URL(frame()!.src).origin).toBe(new URL(PAY).origin);
    // No payHost and not loaded from a gateway: the official host is used.
    document.body.innerHTML = '';
    openButton({ button: 'O7MTkxHr' });
    expect(new URL(frame()!.src).origin).toBe('https://razcryptogateway.com');
    // A broken payHost fails clearly.
    const onError = vi.fn();
    openButton({ button: 'O7MTkxHr', payHost: 'not a url', onError });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'pay_host_missing' }));
  });

  it('checkout_url works without a key (token stays out of the merchant page code)', () => {
    open({ checkout_url: 'https://pay.example/pay_3fK9sQ2mZt7LxR1aPq0B?t=ct_abc' });
    const src = new URL(frame()!.src);
    expect(src.origin + src.pathname).toBe('https://pay.example/embed/pay_3fK9sQ2mZt7LxR1aPq0B');
    expect(src.searchParams.get('t')).toBe('ct_abc');
    const onError = vi.fn();
    open({ checkout_url: 'https://pay.example/whatever', onError });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'invalid_checkout_url' }));
  });

  it('shows a splash until ready, then closes quietly after success (no onClose)', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    open({ key: 'pk_test_abc', payment_id: 'pay_3fK9sQ2mZt7LxR1aPq0B', payHost: PAY, onSuccess, onClose });
    expect(document.querySelector('.rzc-splash')).not.toBeNull();
    expect(frame()!.style.opacity).toBe('0');
    fromFrame({ source: 'razcrypto', type: 'ready', payload: {} });
    expect(frame()!.style.opacity).toBe('1');
    fromFrame({ source: 'razcrypto', type: 'success', payload: { payment_id: 'p', status: 'paid' } });
    fromFrame({ source: 'razcrypto', type: 'done', payload: {} });
    await new Promise((r) => setTimeout(r, 300));
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('.rzc-box')).toBeNull();
  });

  it('preload adds a preconnect once', () => {
    preload({ payHost: PAY });
    preload({ payHost: PAY });
    expect(document.querySelectorAll(`link[rel="preconnect"][href="${PAY}"]`)).toHaveLength(1);
  });
});
