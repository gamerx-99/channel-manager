import { useEffect } from "react";

export type PageMeta = {
  title: string;
  description: string;
  /** Ask search engines not to index this page (an unknown or private hotel). */
  noindex?: boolean;
};

function metaTag(doc: Document, attribute: "name" | "property", key: string) {
  let tag = doc.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  const created = !tag;
  if (!tag) {
    tag = doc.createElement("meta");
    tag.setAttribute(attribute, key);
    doc.head.appendChild(tag);
  }
  return { tag, created, previous: tag.getAttribute("content") };
}

/**
 * Set the title, description and Open Graph tags for this page. Returns a
 * function that puts back what index.html had, for when the page unmounts.
 */
export function applyPageMeta(doc: Document, meta: PageMeta): () => void {
  const previousTitle = doc.title;
  doc.title = meta.title;
  const entries: Array<[ReturnType<typeof metaTag>, string | null]> = [
    [metaTag(doc, "name", "description"), meta.description],
    [metaTag(doc, "property", "og:title"), meta.title],
    [metaTag(doc, "property", "og:description"), meta.description],
    [metaTag(doc, "name", "robots"), meta.noindex ? "noindex" : null],
  ];
  for (const [{ tag }, content] of entries) {
    if (content === null) tag.removeAttribute("content");
    else tag.setAttribute("content", content);
  }
  return () => {
    doc.title = previousTitle;
    for (const [{ tag, created, previous }] of entries) {
      if (created) tag.remove();
      else if (previous === null) tag.removeAttribute("content");
      else tag.setAttribute("content", previous);
    }
  };
}

export function usePageMeta(meta: PageMeta | null) {
  const { title, description, noindex } = meta ?? {};
  useEffect(() => {
    if (title === undefined || description === undefined || typeof document === "undefined") return;
    return applyPageMeta(document, { title, description, noindex });
  }, [title, description, noindex]);
}
