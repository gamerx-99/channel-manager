import { describe, expect, it } from 'vitest';
import {
  parseCoordinatePaste,
  isValidCoordinates,
  validateHotelContacts,
  normalizeLineContact,
} from './hotelLocationRules';

describe('hotelLocationRules', () => {
  describe('parseCoordinatePaste', () => {
    it('parses valid lat, lng string with arbitrary whitespace', () => {
      expect(parseCoordinatePaste('19.30, 97.97')).toEqual({ latitude: 19.3, longitude: 97.97 });
      expect(parseCoordinatePaste('  19.30123 ,  -97.97456  ')).toEqual({ latitude: 19.30123, longitude: -97.97456 });
      expect(parseCoordinatePaste('-12.345, 120.678')).toEqual({ latitude: -12.345, longitude: 120.678 });
    });

    it('returns null for invalid inputs', () => {
      expect(parseCoordinatePaste('')).toBeNull();
      expect(parseCoordinatePaste('not, coordinates')).toBeNull();
      expect(parseCoordinatePaste('19.30')).toBeNull();
      expect(parseCoordinatePaste('19.30, 97.97, 100')).toBeNull();
    });
  });

  describe('isValidCoordinates', () => {
    it('allows both null/undefined (no location set)', () => {
      expect(isValidCoordinates(null, null)).toBe(true);
      expect(isValidCoordinates(undefined, undefined)).toBe(true);
    });

    it('validates coordinate boundaries', () => {
      expect(isValidCoordinates(19.3, 97.97)).toBe(true);
      expect(isValidCoordinates(-90, -180)).toBe(true);
      expect(isValidCoordinates(90, 180)).toBe(true);
      expect(isValidCoordinates(90.1, 97.97)).toBe(false);
      expect(isValidCoordinates(-90.1, 97.97)).toBe(false);
      expect(isValidCoordinates(19.3, 180.1)).toBe(false);
      expect(isValidCoordinates(19.3, -180.1)).toBe(false);
      expect(isValidCoordinates(19.3, null)).toBe(false);
      expect(isValidCoordinates(null, 97.97)).toBe(false);
    });
  });

  describe('validateHotelContacts', () => {
    it('accepts empty contacts when none are enabled', () => {
      expect(validateHotelContacts({
        showPhone: false,
        showFacebook: false,
        showInstagram: false,
        showX: false,
      })).toBeNull();
    });

    it('validates phone characters', () => {
      expect(validateHotelContacts({
        phone: '081 234 5678',
        showPhone: false,
        showFacebook: false,
        showInstagram: false,
        showX: false,
      })).toBeNull();

      expect(validateHotelContacts({
        phone: '+66 81-234-5678',
        showPhone: false,
        showFacebook: false,
        showInstagram: false,
        showX: false,
      })).toBeNull();

      expect(validateHotelContacts({
        phone: '081-abc-1234',
        showPhone: false,
        showFacebook: false,
        showInstagram: false,
        showX: false,
      })).toBe('เบอร์โทรใช้ได้เฉพาะตัวเลข เว้นวรรค + และ -');
    });

    it('requires phone if showPhone is checked', () => {
      expect(validateHotelContacts({
        phone: '   ',
        showPhone: true,
        showFacebook: false,
        showInstagram: false,
        showX: false,
      })).toBe('กรุณาใส่เบอร์โทรโรงแรม');
    });

    it('validates Facebook URLs and require when enabled', () => {
      expect(validateHotelContacts({
        facebook: '',
        showPhone: false,
        showFacebook: true,
        showInstagram: false,
        showX: false,
      })).toBe('กรุณาใส่ลิงก์ Facebook');

      expect(validateHotelContacts({
        facebook: 'http://facebook.com/hotel',
        showPhone: false,
        showFacebook: false,
        showInstagram: false,
        showX: false,
      })).toBe('ลิงก์ Facebook ไม่ถูกต้อง');

      expect(validateHotelContacts({
        facebook: 'https://facebook.com/myhotel',
        showPhone: false,
        showFacebook: true,
        showInstagram: false,
        showX: false,
      })).toBeNull();

      expect(validateHotelContacts({
        facebook: 'https://fb.com/myhotel',
        showPhone: false,
        showFacebook: true,
        showInstagram: false,
        showX: false,
      })).toBeNull();
    });

    it('validates Instagram and X URLs', () => {
      expect(validateHotelContacts({
        instagram: 'https://instagram.com/hotel',
        x: 'https://x.com/hotel',
        showPhone: false,
        showFacebook: false,
        showInstagram: true,
        showX: true,
      })).toBeNull();

      expect(validateHotelContacts({
        instagram: 'https://not-instagram.com/hotel',
        showPhone: false,
        showFacebook: false,
        showInstagram: false,
        showX: false,
      })).toBe('ลิงก์ Instagram ไม่ถูกต้อง');

      expect(validateHotelContacts({
        x: 'https://twitter.com/hotel',
        showPhone: false,
        showFacebook: false,
        showInstagram: false,
        showX: false,
      })).toBeNull();

      expect(validateHotelContacts({
        x: 'https://threads.net/hotel',
        showPhone: false,
        showFacebook: false,
        showInstagram: false,
        showX: false,
      })).toBe('ลิงก์ X ไม่ถูกต้อง');
    });
  });

  describe('normalizeLineContact', () => {
    it('keeps line.me and lin.ee links as is (trimmed)', () => {
      expect(normalizeLineContact('  https://line.me/R/ti/p/@hotel  ')).toBe('https://line.me/R/ti/p/@hotel');
      expect(normalizeLineContact('https://lin.ee/abc123')).toBe('https://lin.ee/abc123');
    });
    it('converts @ Official Account id', () => {
      expect(normalizeLineContact('@hotelname')).toBe('https://line.me/R/ti/p/@hotelname');
    });
    it('converts ~ personal id', () => {
      expect(normalizeLineContact('~myname')).toBe('https://line.me/ti/p/~myname');
    });
    it('converts plain id', () => {
      expect(normalizeLineContact('myhotel01')).toBe('https://line.me/ti/p/~myhotel01');
    });
    it('returns null for empty', () => {
      expect(normalizeLineContact('')).toBeNull();
      expect(normalizeLineContact('   ')).toBeNull();
    });
    it('returns null for invalid', () => {
      expect(normalizeLineContact('https://example.com/x')).toBeNull();
      expect(normalizeLineContact('ab')).toBeNull();
    });
  });

  describe('validateHotelContacts LINE', () => {
    it('requires LINE when showLine is checked', () => {
      expect(validateHotelContacts({
        showPhone: false,
        showFacebook: false,
        showInstagram: false,
        showX: false,
        showLine: true,
        line: '',
      })).toBe('กรุณาใส่ LINE');
    });
    it('rejects invalid LINE value', () => {
      expect(validateHotelContacts({
        showPhone: false,
        showFacebook: false,
        showInstagram: false,
        showX: false,
        showLine: false,
        line: 'ab',
      })).toBe('LINE ไม่ถูกต้อง ใส่ลิงก์ line.me หรือ ID เช่น @hotelname');
    });
    it('accepts valid LINE values', () => {
      expect(validateHotelContacts({
        showPhone: false,
        showFacebook: false,
        showInstagram: false,
        showX: false,
        showLine: true,
        line: '@hotelname',
      })).toBeNull();
    });
  });
});
