import React from "react";

// Footer credit: the hayhost logo linked to our home page. The label (e.g. "จองผ่าน hayhost")
// stays as the accessible name. A label without the word "hayhost" is shown as plain text.
export function PoweredByHayhost({ label }: { label: string }) {
  if (!label.includes("hayhost")) return <span>{label}</span>;
  return (
    <a className="powered-by-hayhost" href="https://www.hayhostth.com/" target="_blank" rel="noopener" aria-label={label} title={label}>
      <img className="powered-by-hayhost-logo" src="/logo-wide.png" alt="" />
    </a>
  );
}
