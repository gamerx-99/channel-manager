/**
 * Exact decimal money arithmetic for D1 values. Inputs stay decimal strings; JavaScript
 * floating-point values are deliberately rejected instead of silently rounded.
 */
export function moneyToSatang(value: string): bigint {
  if (typeof value !== "string") throw new RangeError("Money must be provided as a decimal string.");
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new RangeError("Money must be a decimal string with at most two fractional digits.");

  const sign = match[1] === "-" ? BigInt(-1) : BigInt(1);
  const whole = BigInt(match[2]);
  const fraction = BigInt((match[3] ?? "").padEnd(2, "0") || "0");
  return sign * (whole * BigInt(100) + fraction);
}

export function satangToMoney(value: bigint): string {
  const sign = value < BigInt(0) ? "-" : "";
  const absolute = value < BigInt(0) ? -value : value;
  return `${sign}${absolute / BigInt(100)}.${String(absolute % BigInt(100)).padStart(2, "0")}`;
}

export function sumMoneyInSatang(values: readonly string[]): bigint {
  return values.reduce((total, value) => total + moneyToSatang(value), BigInt(0));
}
