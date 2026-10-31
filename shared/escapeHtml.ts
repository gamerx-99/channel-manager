const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes untrusted text for HTML element content and quoted attribute values. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, character => HTML_ENTITIES[character]);
}
