import { escapeHtml } from "@shared/escapeHtml";

/** Guest and hotel values come from public bookings, so every value is escaped. */
export function buildTm30PrintHtml(hotelName: string, headers: string[], rows: unknown[][], generatedAt: string) {
  const name = escapeHtml(hotelName);
  return `
      <!DOCTYPE html>
      <html lang="th">
      <head>
        <meta charset="utf-8">
        <title>TM.30 Report - ${name}</title>
        <style>
          body { font-family: sans-serif; padding: 20px; color: #111; }
          h1 { font-size: 18px; margin-bottom: 4px; }
          p { font-size: 12px; color: #555; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 10px; }
          th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
          th { background: #f4f4f4; }
        </style>
      </head>
      <body>
        <h1>TM.30 Immigration Report: ${name}</h1>
        <p>Generated: ${escapeHtml(generatedAt)} | Format: DD/MM/YYYY (A.D.)</p>
        <table>
          <thead><tr>${headers.map(h => `<th>${escapeHtml(h.replace(/\n/g, " "))}</th>`).join("")}</tr></thead>
          <tbody>
            ${rows.length ? rows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("") : '<tr><td colspan="9">No records</td></tr>'}
          </tbody>
        </table>
        <script>window.print();</script>
      </body>
      </html>
    `;
}
