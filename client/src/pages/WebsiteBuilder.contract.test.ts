import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

describe('WebsiteBuilder contract — Phase 06', () => {
  const builderDir = resolve(process.cwd(), 'client/src/components/website-builder');
  const wbSource = readFileSync(resolve(process.cwd(), 'client/src/pages/WebsiteBuilder.tsx'), 'utf8')
    + readdirSync(builderDir).filter(file => /\.(ts|tsx|css)$/.test(file)).map(file => readFileSync(resolve(builderDir, file), 'utf8')).join('\n');
  const dbSource = readFileSync(resolve(process.cwd(), 'server/routers.ts'), 'utf8');
  const routerText = readFileSync(resolve(process.cwd(), 'server/routers.ts'), 'utf8');
  const hotelRouterText = readFileSync(resolve(process.cwd(), 'server/routers/hotelRouter.ts'), 'utf8');
  const routerSource = routerText + hotelRouterText;

  // ── tRPC hookup ─────────────────────────────────────────────────────────
  it('WebsiteBuilder hooks into all required tRPC procedures', () => {
    expect(wbSource).toContain('trpc.channelManager.listHotelMedia.useQuery');
    // Uploads use the Worker /api/media route: the tRPC uploadHotelMedia procedure always
    // refuses them, so calling it (as this test used to require) broke every upload.
    expect(wbSource).not.toContain('trpc.channelManager.uploadHotelMedia.useMutation');
    expect(wbSource).toContain('uploadHotelMediaFile(hotel_id, file)');
    expect(wbSource).toContain('trpc.channelManager.deleteHotelMedia.useMutation');
    expect(wbSource).toContain('trpc.channelManager.setHotelMediaHero.useMutation');
    expect(wbSource).toContain('trpc.channelManager.getHotelSiteConfigByHotelId.useQuery');
    expect(wbSource).toContain('trpc.channelManager.saveHotelSiteConfig.useMutation');
    expect(wbSource).toContain('trpc.channelManager.publishHotelSiteConfig.useMutation');
    expect(wbSource).toContain('trpc.channelManager.discardHotelSiteConfigDraft.useMutation');
  });

  it('shows save draft, publish, discard and the visitor-facing publish note', () => {
    expect(wbSource).toContain('websiteBuilder.saveDraft');
    expect(wbSource).toContain('websiteBuilder.publishChanges');
    expect(wbSource).toContain('websiteBuilder.discardDraft');
    expect(wbSource).toContain('websiteBuilder.publishNote');
  });

  it('links to the public hotel page and offers publishing while private', () => {
    expect(wbSource).toContain('websiteBuilder.viewHotelPage');
    expect(wbSource).toContain('window.open(`/${selectedHotel.slug}`');
    expect(wbSource).toContain('websiteBuilder.privatePageNote');
    expect(wbSource).toContain('websiteBuilder.publishPage');
    expect(wbSource).toContain('trpc.channelManager.setHotelPublished.useMutation');
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
    expect(wbSource).toContain('accept="image/jpeg,image/png,image/webp,image/gif,image/avif"');
    expect(wbSource).toContain('allowedTypes');
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
    expect(wbSource).toContain('draft.accentColor');
    expect(wbSource).toContain('draft.heroCopy');
  });

  // ── hotel_domains deferral ───────────────────────────────────────────────
  it('WebsiteBuilder explicitly documents hotel_domains deferral (spec requirement)', () => {
    expect(wbSource).toContain('DECISIONS.md');
    expect(wbSource).toContain('hotel_domains');
    expect(wbSource).toMatch(/deferred|deferral/i);
  });

  // ── D1 media/siteConfig functions ────────────────────────────────────────
  it('server/d1/media.ts exports the R2 upload and delete helpers', () => {
    const mediaSource = readFileSync(resolve(process.cwd(), 'server/d1/media.ts'), 'utf8');
    expect(mediaSource).toContain('export async function uploadHotelMediaToR2');
    expect(mediaSource).toContain('export async function deleteHotelMediaFromR2');
  });

  it('server/d1/siteConfig.ts exports all required hotel media and site config functions', () => {
    const siteConfigSource = readFileSync(resolve(process.cwd(), 'server/d1/siteConfig.ts'), 'utf8');
    expect(siteConfigSource).toContain('export async function listHotelMedia');
    expect(siteConfigSource).toContain('export async function createHotelMedia');
    expect(siteConfigSource).toContain('export async function deleteHotelMedia');
    expect(siteConfigSource).toContain('export async function setHotelMediaHero');
    expect(siteConfigSource).toContain('export async function getHotelSiteConfig');
    expect(siteConfigSource).toContain('export async function saveHotelSiteConfig');
  });

  it('server/d1/media.ts keeps uploads private until publish', () => {
    const mediaSource = readFileSync(resolve(process.cwd(), 'server/d1/media.ts'), 'utf8');
    expect(mediaSource).toContain('isHero: false');
    expect(mediaSource).toContain('isPublished: false');
  });

  it('server/d1/media.ts blocks deletion of the live hero', () => {
    const mediaSource = readFileSync(resolve(process.cwd(), 'server/d1/media.ts'), 'utf8');
    expect(mediaSource).toContain('if (current.isHero) throw new TRPCError');
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

});
