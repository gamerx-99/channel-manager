import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { translate } from './i18n';
import { nightsLabel } from './nightsLabel';

describe('nightsLabel', () => {
  it('prints the number once, with the plural in English', () => {
    const en = (key: string, params: { count: number }) => translate('en', key, params);
    expect(nightsLabel(en, 1)).toBe('1 night');
    expect(nightsLabel(en, 2)).toBe('2 nights');
    expect(nightsLabel((key, params) => translate('th', key, params), 2)).toBe('2 คืน');
  });

  it('is what the public booking summary and confirmation use (regression: "2 2 night")', () => {
    const source = readFileSync(new URL('../pages/PublicHotel.tsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(/nights \?\? 0\} \{t\("publicHotel\.confirmedNights/);
    expect(source.match(/nightsLabel\(t, heldBooking\?\.nights \?\? 0\)/g)?.length).toBe(2);
  });
});
