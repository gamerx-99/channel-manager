/**
 * Phase 12B — Unit tests for EMVCo PromptPay QR string generator.
 *
 * Reference: https://www.bot.or.th/Thai/PaymentSystems/StandardPS/Documents/EMVCo_QR.pdf
 *
 * Key invariants:
 * 1. CRC-16/CCITT-FALSE checksum is the last 4 chars
 * 2. Mobile number is normalised: 0812345678 → 0066812345678 (13 chars with 0066 prefix)
 *    Wait: "0066" + "812345678" = 4+9 = 13 chars. But spec says 14.
 *    Actually: 0066 + 812345678 = 13 digits total. Per BOT spec: 0066 replaces leading 0.
 *    Let's verify: 0812345678 (10 digits) → 0066 + 812345678 = 0066812345678 (13 chars).
 *    Hmm, the implementation says 14: "0066" + digits.slice(1) = 4 + 9 = 13. Fixed.
 * 3. Amount always formatted to 2 decimal places
 * 4. QR string starts with "000201" (EMVCo payload format indicator)
 * 5. QR string ends with "6304" + 4-char CRC hex
 */

import { describe, it, expect } from 'vitest';
import { generatePromptPayQR, buildQrImageUrl } from './promptpay';

describe('generatePromptPayQR', () => {
  it('produces a string starting with EMVCo payload format indicator', () => {
    const qr = generatePromptPayQR({ promptPayId: '0812345678', amount: 100, ref: 'TEST-01' });
    expect(qr).toMatch(/^000201/);
  });

  it('ends with 6304 + 4 uppercase hex CRC', () => {
    const qr = generatePromptPayQR({ promptPayId: '0812345678', amount: 100, ref: 'TEST-01' });
    expect(qr).toMatch(/6304[0-9A-F]{4}$/);
  });

  it('embeds the amount formatted to 2 decimal places', () => {
    const qr = generatePromptPayQR({ promptPayId: '0812345678', amount: 3500, ref: 'REF' });
    expect(qr).toContain('3500.00');
  });

  it('handles fractional amounts correctly', () => {
    const qr = generatePromptPayQR({ promptPayId: '0812345678', amount: 199.5, ref: 'REF' });
    expect(qr).toContain('199.50');
  });

  it('normalises 10-digit mobile number with 0066 prefix', () => {
    const qr = generatePromptPayQR({ promptPayId: '0812345678', amount: 100, ref: 'REF' });
    // 0812345678 → 0066812345678
    expect(qr).toContain('0066812345678');
  });

  it('accepts 13-digit National ID as-is', () => {
    const qr = generatePromptPayQR({ promptPayId: '1234567890123', amount: 100, ref: 'REF' });
    expect(qr).toContain('1234567890123');
  });

  it('includes the transaction reference', () => {
    const qr = generatePromptPayQR({ promptPayId: '0812345678', amount: 500, ref: 'BK-ABCD1234' });
    expect(qr).toContain('BK-ABCD1234');
  });

  it('includes THB currency code 764', () => {
    const qr = generatePromptPayQR({ promptPayId: '0812345678', amount: 100, ref: 'REF' });
    // EMVCo: tag=53, length=03, value=764
    expect(qr).toContain('5303764'); // correct: tag53 + len03 + value764
  });

  it('includes TH country code', () => {
    const qr = generatePromptPayQR({ promptPayId: '0812345678', amount: 100, ref: 'REF' });
    expect(qr).toContain('5802TH'); // tag 58, len 02, value TH
  });

  it('generates different CRCs for different amounts', () => {
    const qr1 = generatePromptPayQR({ promptPayId: '0812345678', amount: 100, ref: 'REF' });
    const qr2 = generatePromptPayQR({ promptPayId: '0812345678', amount: 200, ref: 'REF' });
    const crc1 = qr1.slice(-4);
    const crc2 = qr2.slice(-4);
    expect(crc1).not.toBe(crc2);
  });

  it('throws on amount <= 0', () => {
    expect(() => generatePromptPayQR({ promptPayId: '0812345678', amount: 0, ref: 'REF' }))
      .toThrow('Amount must be greater than zero');
    expect(() => generatePromptPayQR({ promptPayId: '0812345678', amount: -1, ref: 'REF' }))
      .toThrow('Amount must be greater than zero');
  });

  it('throws on invalid PromptPay ID (not 10 or 13 digits)', () => {
    expect(() => generatePromptPayQR({ promptPayId: '12345', amount: 100, ref: 'REF' }))
      .toThrow('Invalid PromptPay ID');
  });

  it('throws on ref > 25 chars', () => {
    expect(() => generatePromptPayQR({ promptPayId: '0812345678', amount: 100, ref: 'A'.repeat(26) }))
      .toThrow('ref must be 1');
  });
});

describe('buildQrImageUrl', () => {
  it('returns a qrserver.com URL with the encoded QR string', () => {
    const url = buildQrImageUrl('test-payload');
    expect(url).toContain('api.qrserver.com');
    expect(url).toContain('test-payload');
  });

  it('includes default size 300x300', () => {
    const url = buildQrImageUrl('payload');
    expect(url).toContain('300x300');
  });

  it('respects custom size', () => {
    const url = buildQrImageUrl('payload', 200);
    expect(url).toContain('200x200');
  });
});
