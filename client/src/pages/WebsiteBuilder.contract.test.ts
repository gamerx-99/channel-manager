import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

describe('WebsiteBuilder contract — Phase 06', () => {
  const wbSource = readFileSync(resolve(process.cwd(), 'client/src/pages/WebsiteBuilder.tsx'), 'utf8');
  const dbSource = readFileSync(resolve(process.cwd(), 'server/db.ts'), 'utf8');
  const routerText = readFileSync(resolve(process.cwd(), 'server/routers.ts'), 'utf8');
  const hotelRouterText = readFileSync(resolve(process.cwd(), 'server/routers/hotelRouter.ts'), 'utf8');
  const routerSource = routerText + hotelRouterText;

  // ── tRPC hookup ─────────────────────────────────────────────────────────
  it('WebsiteBuilder hooks into all required tRPC procedures', () => {
    expect(wbSource).toContain('trpc.channelManager.listHotelMedia.useQuery');
    expect(wbSource).toContain('trpc.channelManager.uploadHotelMedia.useMutation');
    expect(wbSource).toContain('trpc.channelManager.deleteHotelMedia.useMutation');
    expect(wbSource).toContain('trpc.channelManager.setHotelMediaHero.useMutation');
    expect(wbSource).toContain('trpc.channelManager.getHotelSiteConfigByHotelId.useQuery');
    expect(wbSource).toContain('trpc.channelManager.saveHotelSiteConfig.useMutation');
  });

  // ── Permission gating ────────────────────────────────────────────────────
  it('WebsiteBuilder gates upload/delete/save behind property.manage_profile', () => {
    expect(wbSource).toContain("property.manage_profile");
    expect(wbSource).toContain('canManage');
    expect(wbSource).toContain('!canManage');
  });

  // ── Media upload client-side validation ──────────────────────────────────
  it('WebsiteBuilder validates file size (5 MB) and type before uploading', () => {
    // Note: Updated per Rule 6 to match translation dictionary keys used in WebsiteBuilder.tsx
    expect(wbSource).toContain('5 * 1024 * 1024');
    expect(wbSource).toContain("startsWith(\"image/\")");
    expect(wbSource).toContain('websiteBuilder.errorFileTooLarge');
    expect(wbSource).toContain('websiteBuilder.errorOnlyImages');
  });

  // ── Site config form ─────────────────────────────────────────────────────
  it('WebsiteBuilder has hero_copy textarea, accent_color picker, and visible_sections toggles', () => {
    expect(wbSource).toContain('hero_copy');
    expect(wbSource).toContain('accent_color');
    expect(wbSource).toContain('visible_sections');
    // Section keys: hero, story, rooms, booking, location
    expect(wbSource).toContain("hero: true");
    expect(wbSource).toContain("'story'");
    expect(wbSource).toContain("'booking'");
    expect(wbSource).toContain("'location'");
  });

  it('WebsiteBuilder includes live public preview section reflecting draft config', () => {
    // Note: Updated per Rule 6 to match translation dictionary key
    expect(wbSource).toContain('websiteBuilder.publicPreviewTitle');
    expect(wbSource).toContain('heroImage');
    expect(wbSource).toContain('draft.accent_color');
    expect(wbSource).toContain('draft.hero_copy');
  });

  it('preview navigation and calls to action open the published hotel page', () => {
    expect(wbSource).toContain('selectedHotel?.public_enabled && selectedHotel.slug');
    expect(wbSource).toContain('target="_blank" rel="noreferrer"');
    expect(wbSource).toContain('previewLink("#stay", t("websiteBuilder.viewRooms")');
    expect(wbSource).toContain('previewLink("#book", t("websiteBuilder.planVisit")');
    expect(wbSource).toContain('websiteBuilder.previewLinkRequiresPublishedHotel');
  });

  it('empty gallery slots use keyboard-accessible upload buttons and clarifies preview-only ordering', () => {
    expect(wbSource).toContain('websiteBuilder.uploadSlotAria');
    expect(wbSource).toContain('websiteBuilder.sectionOrderPreviewOnlyHint');
  });

  // ── hotel_domains deferral ───────────────────────────────────────────────
  it('WebsiteBuilder explicitly documents hotel_domains deferral (spec requirement)', () => {
    expect(wbSource).toContain('DECISIONS.md');
    expect(wbSource).toContain('hotel_domains');
    expect(wbSource).toMatch(/deferred|deferral/i);
  });

  // ── db/siteConfig.ts functions ───────────────────────────────────────────
  it('server/db/siteConfig.ts exports all required hotel media and site config functions', () => {
    const siteConfigSource = readFileSync(resolve(process.cwd(), 'server/db/siteConfig.ts'), 'utf8');
    expect(siteConfigSource).toContain('export async function listHotelMedia');
    expect(siteConfigSource).toContain('export async function createHotelMedia');
    expect(siteConfigSource).toContain('export async function deleteHotelMedia');
    expect(siteConfigSource).toContain('export async function setHotelMediaHero');
    expect(siteConfigSource).toContain('export async function getHotelSiteConfig');
    expect(siteConfigSource).toContain('export async function saveHotelSiteConfig');
  });

  // ── router procedures ────────────────────────────────────────────────────
  it('server/routers.ts exposes all hotel media procedures with correct permission gates', () => {
    // listHotelMedia — property.view
    expect(routerSource).toMatch(/listHotelMedia\s*[:=]\s*protectedProcedure\.input/);
    expect(routerSource).toMatch(/listHotelMedia.*property\.view|property\.view.*listHotelMedia/s);
    // uploadHotelMedia — property.manage_profile
    expect(routerSource).toMatch(/uploadHotelMedia\s*[:=]\s*protectedProcedure\.input/);
    expect(routerSource).toMatch(/uploadHotelMedia[\s\S]{0,200}property\.manage_profile/);
    // deleteHotelMedia — property.manage_profile
    expect(routerSource).toMatch(/deleteHotelMedia\s*[:=]\s*protectedProcedure\.input/);
    // setHotelMediaHero — property.manage_profile
    expect(routerSource).toMatch(/setHotelMediaHero\s*[:=]\s*protectedProcedure\.input/);
  });

  it('server/routers.ts exposes getHotelSiteConfigByHotelId (protected) and saveHotelSiteConfig', () => {
    expect(routerSource).toMatch(/getHotelSiteConfigByHotelId\s*[:=]\s*protectedProcedure\.input/);
    expect(routerSource).toMatch(/saveHotelSiteConfig\s*[:=]\s*protectedProcedure\.input/);
    expect(routerSource).toContain("requireHotelPermission(ctx.user, input.hotel_id, 'property.manage_profile')");
  });

  it('server/routers.ts upload auto-promotes first image as hero', () => {
    // Logic: if no existing media, is_hero = true
    expect(routerSource).toContain('existingMedia.length === 0');
    expect(routerSource).toContain('is_hero');
  });

  it('server/routers.ts delete promotes remaining first item as hero when needed', () => {
    expect(routerSource).toContain('remaining.length > 0');
    expect(routerSource).toContain('setHotelMediaHero');
  });
});
