/**
 * Phase 12B — EMVCo Merchant-Presented QR string generator for Thai PromptPay.
 *
 * Implements the BOT/EMVCo spec used by Thai banks:
 * https://www.bot.or.th/Thai/PaymentSystems/StandardPS/Documents/EMVCo_QR.pdf
 *
 * Generates a QR string that encodes:
 * - PromptPay receiver (mobile / national ID / tax ID)
 * - Amount in THB
 * Booking references remain in payment sessions; they are not recipient IDs.
 *
 * The string is returned to the client which renders it via a QR library or
 * a QR image API — no binary output here.
 */
import { normalisePromptPayId } from '../shared/promptPayId';

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) — required by EMVCo */
function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return ((crc & 0xffff).toString(16).toUpperCase()).padStart(4, '0');
}

/** Build a TLV (Tag-Length-Value) segment as per EMVCo spec */
function tlv(tag: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${tag}${len}${value}`;
}

/**
 * The shared validator supplies the EMVCo receiver value while preserving the
 * existing payload for valid local mobile and 13-digit IDs.
 */

export interface GenerateQROptions {
  promptPayId: string;
  /** Amount in THB (must be > 0) */
  amount: number;
  /** Internal booking/session reference (max 25 chars); not encoded as a recipient. */
  ref: string;
}

/**
 * Generate an EMVCo PromptPay QR string.
 * The returned string can be encoded into a QR code by the client.
 *
 * Example usage:
 *   const qrString = generatePromptPayQR({ promptPayId: '0812345678', amount: 3500, ref: 'BK-001' });
 */
export function generatePromptPayQR({ promptPayId, amount, ref }: GenerateQROptions): string {
  if (amount <= 0) throw new Error('Amount must be greater than zero.');
  if (!ref || ref.length > 25) throw new Error('ref must be 1–25 characters.');

  const receiver = normalisePromptPayId(promptPayId);
  if (!receiver) throw new Error('Invalid PromptPay ID. Expected a 06, 08 or 09 mobile or 13-digit National/Tax ID.');

  // Merchant Account Info (tag 29 for PromptPay)
  //   00: GUID  "A000000677010111"
  // BOT Thai QR standard, section 2.3: subtag 01 is a mobile number;
  // subtag 02 is a National/Tax ID. Never put a booking reference there.
  // This is credit transfer (tag 29), not bill payment (tag 30).
  const merchantAccount = tlv(
    '29',
    tlv('00', 'A000000677010111') + tlv(receiver.type === 'mobile' ? '01' : '02', receiver.emvValue),
  );

  // Amount — always 2 decimal places
  const amountStr = amount.toFixed(2);

  // Build payload (without CRC)
  const payloadNoCrc =
    tlv('00', '01') +          // Payload format indicator
    tlv('01', '12') +          // Point of initiation: dynamic (12)
    merchantAccount +
    tlv('53', '764') +         // Transaction currency: 764 = THB
    tlv('54', amountStr) +     // Transaction amount
    tlv('58', 'TH') +          // Country code
    '6304';                    // CRC tag, length 04, value to be appended

  return payloadNoCrc + crc16(payloadNoCrc);
}

/**
 * Build a QR image URL using the free qrserver.com API.
 * The returned URL can be used in an <img> src directly.
 *
 * @param qrString - EMVCo payload string
 * @param size - pixel size of the QR image (default 300)
 */
export function buildQrImageUrl(qrString: string, size = 300): string {
  const encoded = encodeURIComponent(qrString);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}`;
}
