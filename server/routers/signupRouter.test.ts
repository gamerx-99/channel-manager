import { describe, expect, it } from 'vitest';
import { slugifyHotelName, uniqueSlug } from './signupRouter';

describe('signup slug rules', () => {
  it('keeps Thai letters so a Thai hotel name yields a usable slug', () => {
    expect(slugifyHotelName('โรงแรม สุขใจ')).toBe('โรงแรม-สุขใจ');
    expect(slugifyHotelName('บ้านพัก ติ๊ก ริมทะเล')).toBe('บ้านพัก-ติ๊ก-ริมทะเล');
  });

  it('lowercases latin names and collapses separators', () => {
    expect(slugifyHotelName('Little Bro Hotel')).toBe('little-bro-hotel');
    expect(slugifyHotelName('  Blue   Pool   Resort  ')).toBe('blue-pool-resort');
    expect(slugifyHotelName('Sun---rise')).toBe('sun-rise');
  });

  it('strips punctuation that would break a URL segment', () => {
    expect(slugifyHotelName('Hotel @#$%^ &* Co.')).toBe('hotel-co');
    expect(slugifyHotelName('รีสอร์ท/สวน')).toBe('รีสอร์ทสวน');
  });

  it('never returns leading or trailing hyphens', () => {
    expect(slugifyHotelName('---Test---')).toBe('test');
    expect(slugifyHotelName('!!!')).toBe('');
  });

  it('caps the length so the slug stays a usable URL segment', () => {
    expect(slugifyHotelName('a'.repeat(200)).length).toBe(80);
  });
});

describe('uniqueSlug', () => {
  it('returns the base when it is free', async () => {
    expect(await uniqueSlug('blue-pool', async () => false)).toBe('blue-pool');
  });

  it('appends the first free numeric suffix', async () => {
    const taken = new Set(['hotel', 'hotel-2', 'hotel-3']);
    expect(await uniqueSlug('hotel', async c => taken.has(c))).toBe('hotel-4');
  });

  it('skips taken suffixes rather than overwriting another hotel URL', async () => {
    const taken = new Set(['resort', 'resort-2']);
    expect(await uniqueSlug('resort', async c => taken.has(c))).toBe('resort-3');
  });

  it('falls back to a random suffix for an empty base', async () => {
    const slug = await uniqueSlug('', async () => false);
    expect(slug).toBe('hotel');
    const longTaken = await uniqueSlug('', async () => true);
    expect(longTaken.startsWith('hotel-')).toBe(true);
  });
});