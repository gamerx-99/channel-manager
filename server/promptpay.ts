/**
 * Phase 12B — EMVCo Merchant-Presented QR string generator for Thai PromptPay.
 *
 * Implements the BOT/EMVCo spec used by Thai banks:
 * https://www.bot.or.th/Thai/PaymentSystems/StandardPS/Documents/EMVCo_QR.pdf
 *
 * Generates a QR string that encodes:
 * - PromptPay receiver (mobile / national ID / tax ID)
 * - Amount in THB
 * - Unique transaction reference (for idempotent slip verification)
 *
 * The string is returned to the client which renders it via a QR library or
 * a QR image API — no binary output here.
 */

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
 * Normalise a PromptPay ID to the EMVCo format:
 * - Mobile (10 digits starting with 0): prefix 0066, drop leading 0 → 14 digits
 * - National ID (13 digits): use as-is
 * - Tax ID (13 digits): use as-is
 */
function normalisePromptPayId(raw: string): { type: 'mobile' | 'id'; value: string } {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) {
    return { type: 'mobile', value: `0066${digits.slice(1)}` }; // 14 digits
  }
  if (digits.length === 13) {
    return { type: 'id', value: digits };
  }
  throw new Error(
    `Invalid PromptPay ID "${raw}". Expected 10-digit mobile (08x) or 13-digit National/Tax ID.`,
  );
}

export interface GenerateQROptions {
  promptPayId: string;
  /** Amount in THB (must be > 0) */
  amount: number;
  /** Unique booking/session reference (max 25 chars) */
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

  const { value: ppId } = normalisePromptPayId(promptPayId);

  // Merchant Account Info (tag 29 for PromptPay)
  //   00: GUID  "A000000677010111"
  //   01: PromptPay ID
  //   02: Transaction ref (biller reference / invoice number)
  const merchantAccount = tlv(
    '29',
    tlv('00', 'A000000677010111') + tlv('01', ppId) + tlv('02', ref),
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
