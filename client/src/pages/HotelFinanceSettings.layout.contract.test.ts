import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('finance settings page layout', () => {
  const css = read('client/src/components/hotel/HotelPaymentSettings.css');
  const pageCss = read('client/src/pages/HotelFinanceSettings.css');
  const slipOk = read('client/src/components/SlipOkSettings.tsx');
  const payment = read('client/src/components/hotel/HotelPaymentSettings.tsx');

  it('removes the shared Card padding and gap so the cards have no dead space', () => {
    expect(css).toContain('.hotel-payment-settings .hotel-payment-card { gap: 0; padding: 0;');
    expect(css).toContain('.hotel-payment-card-header { padding: 20px 24px 0; }');
    expect(css).toContain('.hotel-payment-card-content { display: grid; gap: 16px; padding: 16px 24px 24px; }');
  });

  it('gives the card title and description their own sizes', () => {
    expect(css).toContain('[data-slot="card-title"] { color: var(--ink); font-size: 15px;');
    expect(css).toContain('[data-slot="card-description"] { margin-top: 2px; color: var(--ink-muted); font-size: 12px;');
  });

  it('lines the SlipOK block up with the cards instead of boxing it a second time', () => {
    expect(slipOk).toContain('className="panel slipok-panel"');
    expect(slipOk).toContain('<Card className="hotel-payment-card slipok-card">');
    expect(slipOk).toContain('<CardContent className="slipok-card-content">');
    expect(css).toContain('.hotel-payment-settings > .slipok-panel { margin: 8px 24px 0;');
    expect(css).toContain('.slipok-panel > .panel-heading { padding: 8px 0 12px; }');
    expect(css).toContain('.hotel-payment-settings .slipok-card-content { padding: 20px 24px; }');
  });

  it('keeps the same 24px side padding on the plan card and 16px on a phone', () => {
    expect(pageCss).toContain('.hotel-finance-settings-page > .home-plan-card > p { margin: 0 24px 16px;');
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.hotel-payment-card-header \{ padding: 16px 16px 0; \}/);
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*\.slipok-card-content \{ padding: 16px; \}/);
  });

  it('keeps the tour target and the SlipOK guide link', () => {
    expect(payment).toContain('data-tour="finance-settings"');
    expect(slipOk).toContain('data-testid="slipok-guide-link"');
  });
});
