/** Saves a file the server returned as base64 (for example an Excel file) through the browser's download. */
export function downloadBase64File(base64: string, filename: string, contentType: string) {
  const binary = window.atob(base64);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
