import React from "react";

// Renders a footer credit such as "จองผ่าน hayhost" with "hayhost" linked to our home page.
export function PoweredByHayhost({ label }: { label: string }) {
  const at = label.lastIndexOf("hayhost");
  if (at < 0) return <span>{label}</span>;
  return (
    <span>
      {label.slice(0, at)}
      <a className="powered-by-hayhost" href="https://www.hayhostth.com/" target="_blank" rel="noopener">hayhost</a>
      {label.slice(at + "hayhost".length)}
    </span>
  );
}
