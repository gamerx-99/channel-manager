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
