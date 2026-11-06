import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import th from '../../lib/i18n/th';
import en from '../../lib/i18n/en';

const dir = dirname(fileURLToPath(import.meta.url));
const themeFiles = ['minimal-white/MinimalWhite.tsx', 'lanna-teak/LannaTeak.tsx', 'cafe-homestay/CafeHomestay.tsx', 'mountain-mist/MountainMist.tsx', 'boutique-noir/BoutiqueNoir.tsx'];

function collectKeys(): Set<string> {
  const keys = new Set<string>();
  const re = /t\("hotelThemes\.([a-zA-Z0-9_.]+)"/g;
  for (const file of themeFiles) {
    const src = readFileSync(resolve(dir, file), 'utf8');
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) keys.add(m[1]);
    if (file.includes("BoutiqueNoir")) {
      const helper = /tt\("([a-zA-Z0-9_.]+)"/g;
      while ((m = helper.exec(src)) !== null) keys.add(`boutiqueNoir.${m[1]}`);
    }
  }
  for (const suffix of ["mainNav", "navRooms", "navGallery", "navLocation", "language", "bookNow", "storyEyebrow", "story", "storyBody", "roomsEyebrow", "rooms", "sleeps", "persons", "from", "currency", "perNight", "select", "galleryEyebrow", "gallery", "locationEyebrow", "location", "poweredBy"]) keys.add(`mountainMist.${suffix}`);
  return keys;
}

function resolvePath(obj: any, path: string): unknown {
  return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
}

describe('hotel theme i18n keys', () => {
  const keys = collectKeys();
  it('every t("hotelThemes.…") key exists in th', () => {
    for (const key of keys) {
      expect(resolvePath(th, `hotelThemes.${key}`), `th missing ${key}`).toBeDefined();
    }
  });
  it('every t("hotelThemes.…") key exists in en', () => {
    for (const key of keys) {
      expect(resolvePath(en, `hotelThemes.${key}`), `en missing ${key}`).toBeDefined();
    }
  });
});
