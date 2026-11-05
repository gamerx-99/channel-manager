/** The server answers a staff booking on a closed night with a CONFLICT whose message starts with STOP_SELL and lists the ISO nights. */
export function parseStopSellNights(message: string | undefined | null): string[] | null {
  if (!message || !message.startsWith('STOP_SELL')) return null;
  return message.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
}

/** 2026-11-02 -> 02/11/2026, the format the wizard's date fields use. */
export function nightsForDisplay(nights: string[]): string {
  return nights.map(night => night.split('-').reverse().join('/')).join(', ');
}
