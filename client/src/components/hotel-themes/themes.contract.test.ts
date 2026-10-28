import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { HOTEL_THEMES, HOTEL_THEME_IDS, resolveHotelTheme } from './registry';

const dir = resolve(process.cwd(), 'client/src/components/hotel-themes');
const read = (file: string) => readFileSync(resolve(dir, file), 'utf8');

// Theme id → [component file, stylesheet, Thai font family the theme must load]
const THEME_FILES = {
  'minimal-white': ['MinimalWhiteLanding.tsx', 'minimal-white.css', 'IBM+Plex+Sans+Thai'],
  'lanna-teak': ['LannaTeakLanding.tsx', 'lanna-teak.css', 'Noto+Serif+Thai'],
  'cafe-homestay': ['CafeHomestayLanding.tsx', 'cafe-homestay.css', 'Noto+Sans+Thai'],
} as const;

// Things the hotel never provided or we cannot promise (spec 16 never-render list).
const BANNED = [/\bsince\b/i, /\bEst\./, /concierge/i, /amenit/i, /grayscale/i, /instant confirmation/i, /\bwire\b/i, /cancellation/i, /review/i, /rating/i, /whatsapp/i];

describe('hotel landing themes (spec 16)', () => {
  it('resolves only known theme ids from ?theme=', () => {
    expect(resolveHotelTheme('?theme=minimal-white')).toBe('minimal-white');
    expect(resolveHotelTheme('?theme=unknown')).toBeNull();
    expect(resolveHotelTheme('')).toBeNull();
  });

  it('PublicHotel renders a theme only for a known id and falls back to the default page otherwise', () => {
    const page = readFileSync(resolve(process.cwd(), 'client/src/pages/PublicHotel.tsx'), 'utf8');
    expect(page).toContain('resolveHotelTheme(window.location.search)');
    expect(page).toMatch(/if \(themeId && hasThemeComponent\(themeId\)\)/);
    expect(page).toContain('siteConfig?.accent_color ?? HOTEL_THEMES[themeId].primary');
  });

  for (const [themeId, [component, stylesheet, thaiFont]] of Object.entries(THEME_FILES)) {
    describe(themeId, () => {
      const source = read(component);
      const css = read(stylesheet);

      it('is registered and lazily loaded', () => {
        expect(HOTEL_THEME_IDS).toContain(themeId);
        expect(read('ThemedLanding.tsx')).toContain(`"${themeId}": lazy(() => import("./${component.replace('.tsx', '')}"))`);
      });

      it('loads a Thai font with Thai glyphs', () => {
        expect(HOTEL_THEMES[themeId as keyof typeof HOTEL_THEMES].fontHref).toContain(thaiFont);
        expect(source).toContain(`useThemeFonts(HOTEL_THEMES["${themeId}"].fontHref)`);
      });

      it('uses the shared BookingFlow and scopes every CSS rule under its theme class', () => {
        expect(source).toContain('<BookingFlow');
        expect(source).toContain(`className="theme-${themeId}"`);
        const selectors = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/^[^@{}\n][^{}]*\{/gm) ?? [];
        for (const selector of selectors) expect(selector.trim(), selector).toMatch(new RegExp(`^\\.theme-${themeId}`));
      });

      it('renders none of the banned claims', () => {
        for (const pattern of BANNED) {
          expect(source, String(pattern)).not.toMatch(pattern);
          expect(css.replace(/\/\*[\s\S]*?\*\//g, ''), String(pattern)).not.toMatch(pattern);
        }
      });

      it('has no mobile bottom navigation beyond the booking bar', () => {
        expect(source).not.toMatch(/bottom-?nav/i);
      });
    });
  }
});
