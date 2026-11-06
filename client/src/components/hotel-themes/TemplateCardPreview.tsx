import { getHotelThemeRegistryEntry, type TemplateCardPreviewProps } from "./registry";
import "./template-card-preview.css";
export default function TemplateCardPreview({ theme, hotelName, photo, objectPosition }: TemplateCardPreviewProps) {
  const entry = getHotelThemeRegistryEntry(theme);
  if (!entry) return null;
  return <div className={`template-card-preview preview-${theme}`} style={entry.previewStyle} aria-label={hotelName}>
    <div className="preview-topline"><span className="preview-mark" aria-hidden="true" /><span className="preview-lines" aria-hidden="true"><i /><i /></span></div>
    <div className="preview-hero" style={photo ? { backgroundImage: `url("${photo.replaceAll('"', '%22')}")`, backgroundPosition: objectPosition ?? "center" } : undefined}>
      <h3>{hotelName}</h3>
    </div>
    <div className="preview-bottomline" aria-hidden="true"><i /><i /><i /></div>
  </div>;
}
