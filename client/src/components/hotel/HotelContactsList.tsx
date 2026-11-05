import React from 'react';
import { Phone, ExternalLink } from 'lucide-react';

export interface HotelContactsListProps {
  phone?: string | null;
  lineUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  xUrl?: string | null;
  className?: string;
  style?: React.CSSProperties;
}

export function HotelContactsList({
  phone,
  lineUrl,
  facebookUrl,
  instagramUrl,
  xUrl,
  className = '',
  style,
}: HotelContactsListProps) {
  const hasPhone = Boolean(phone?.trim());
  const hasLine = Boolean(lineUrl?.trim());
  const hasFb = Boolean(facebookUrl?.trim());
  const hasIg = Boolean(instagramUrl?.trim());
  const hasX = Boolean(xUrl?.trim());

  if (!hasPhone && !hasLine && !hasFb && !hasIg && !hasX) return null;

  return (
    <div
      className={`hotel-contacts-list ${className}`}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 12,
        marginTop: 12,
        ...style,
      }}
    >
      {hasPhone && (
        <a
          href={`tel:${phone!.trim()}`}
          className="contact-link contact-phone"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Phone size={14} />
          <span>{phone!.trim()}</span>
        </a>
      )}

      {hasLine && (
        <a
          href={lineUrl!.trim()}
          target="_blank"
          rel="noopener noreferrer"
          className="contact-link contact-line"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <span>LINE</span>
          <ExternalLink size={12} />
        </a>
      )}

      {hasFb && (
        <a
          href={facebookUrl!.trim()}
          target="_blank"
          rel="noopener noreferrer"
          className="contact-link contact-facebook"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <span>Facebook</span>
          <ExternalLink size={12} />
        </a>
      )}

      {hasIg && (
        <a
          href={instagramUrl!.trim()}
          target="_blank"
          rel="noopener noreferrer"
          className="contact-link contact-instagram"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <span>Instagram</span>
          <ExternalLink size={12} />
        </a>
      )}

      {hasX && (
        <a
          href={xUrl!.trim()}
          target="_blank"
          rel="noopener noreferrer"
          className="contact-link contact-x"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <span>X</span>
          <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}

export default HotelContactsList;