/** A PromptPay receiver ID in the form stored for hotels and used in QR payloads. */
export function normalisePromptPayId(raw: string): { type: "mobile" | "id"; value: string; emvValue: string } | null {
  const compact = raw.replace(/[\s.()\-]/g, "");
  const local = /^0[689]\d{8}$/.test(compact)
    ? compact
    : /^(?:\+66|0066|66)[689]\d{8}$/.test(compact)
      ? `0${compact.replace(/^(?:\+66|0066|66)/, "")}`
      : null;
  if (local) return { type: "mobile", value: local, emvValue: `0066${local.slice(1)}` };
  // ASSUMPTION: preserve existing 13-digit National/Tax ID behaviour without a checksum.
  if (/^\d{13}$/.test(compact)) return { type: "id", value: compact, emvValue: compact };
  return null;
}

/**
 * Check digit of a 13-digit Thai ID (Modulus 11): digit 1 is weighted 13, digit 2 is 12 … digit 12 is 2,
 * and the 13th digit must equal (11 - sum % 11) % 10. This is the standard used for national ID numbers.
 * Note: a weighting of 12 down to 1 (as in the 2026-11-11 decision sheet) is off by one and rejects valid numbers.
 */
export function hasValidThaiIdChecksum(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let index = 0; index < 12; index += 1) sum += Number(id[index]) * (13 - index);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

export type PromptPayIdProblem = "format" | "id_checksum";

/**
 * Stricter than normalisePromptPayId, for saving only (owner, 2026-11-11): a 13-digit PromptPay number must pass the
 * Thai ID checksum. People whose card type cannot register PromptPay by ID use their mobile number instead.
 * QR generation keeps using normalisePromptPayId, so an ID saved before this rule never stops guests from paying.
 */
export function checkPromptPayIdForSave(raw: string):
  | { ok: true; value: string }
  | { ok: false; problem: PromptPayIdProblem } {
  const normalised = normalisePromptPayId(raw);
  if (!normalised) return { ok: false, problem: "format" };
  if (normalised.type === "id" && !hasValidThaiIdChecksum(normalised.value)) return { ok: false, problem: "id_checksum" };
  return { ok: true, value: normalised.value };
}

