import type { CSSProperties } from "react";
import type { HotelThemeId } from "@shared/hotelThemes";
import "./template-card-preview.css";

const previewStyles: Record<HotelThemeId, CSSProperties> = {
  "minimal-white": { "--preview-bg": "#f9f9f7", "--preview-surface": "#fff", "--preview-ink": "#1a1c1b", "--preview-muted": "#656962", "--preview-accent": "#52604b" } as CSSProperties,
  "lanna-teak": { "--preview-bg": "#fff8f5", "--preview-surface": "#f0dfd5", "--preview-ink": "#2a211b", "--preview-muted": "#76675f", "--preview-accent": "#41240d" } as CSSProperties,
  "cafe-homestay": { "--preview-bg": "#fff8f0", "--preview-surface": "#f2dfc9", "--preview-ink": "#321f12", "--preview-muted": "#7a573d", "--preview-accent": "#a66b4f" } as CSSProperties,
};

export default function TemplateCardPreview({ theme, hotelName, photo }: { theme: HotelThemeId; hotelName: string; photo: string | null }) {
  return <div className={`template-card-preview preview-${theme}`} style={previewStyles[theme]} aria-label={hotelName}>
    <div className="preview-topline"><span className="preview-mark" aria-hidden="true" /><span className="preview-lines" aria-hidden="true"><i /><i /></span></div>
    <div className="preview-hero" style={photo ? { backgroundImage: `url("${photo.replaceAll('"', '%22')}")` } : undefined}>
      <h3>{hotelName}</h3>
    </div>
    <div className="preview-bottomline" aria-hidden="true"><i /><i /><i /></div>
  </div>;
}
