import React from 'react';
import { Phone, MessageCircle, Facebook, Instagram } from 'lucide-react';

export interface HotelContactsListProps {
  phone?: string | null;
  lineUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  xUrl?: string | null;
  className?: string;
  style?: React.CSSProperties;
}

// lucide has no X logo, so it is drawn here.
function XLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const linkStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6 };

function IconLink({ href, label, className, children }: { href: string; label: string; className: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`contact-link ${className}`} style={linkStyle} aria-label={label} title={label}>
      {children}
    </a>
  );
}

// Every contact is an icon (Phone, LINE, Facebook, Instagram, X); a channel is shown only when set.
// The phone number stays visible next to its icon so it can be read and dialled.
export function HotelContactsList({
  phone,
  lineUrl,
  facebookUrl,
  instagramUrl,
  xUrl,
  className = '',
  style,
}: HotelContactsListProps) {
  const phoneNumber = phone?.trim() ?? '';
  const line = lineUrl?.trim() ?? '';
  const facebook = facebookUrl?.trim() ?? '';
  const instagram = instagramUrl?.trim() ?? '';
  const x = xUrl?.trim() ?? '';

  if (!phoneNumber && !line && !facebook && !instagram && !x) return null;

  return (
    <div
      className={`hotel-contacts-list ${className}`}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 16,
        marginTop: 12,
        ...style,
      }}
    >
      {phoneNumber && (
        <a href={`tel:${phoneNumber}`} className="contact-link contact-phone" style={linkStyle} aria-label={phoneNumber} title={phoneNumber}>
          <Phone size={20} aria-hidden="true" />
          <span>{phoneNumber}</span>
        </a>
      )}
      {line && (
        <IconLink href={line} label="LINE" className="contact-line">
          <MessageCircle size={20} aria-hidden="true" />
        </IconLink>
      )}
      {facebook && (
        <IconLink href={facebook} label="Facebook" className="contact-facebook">
          <Facebook size={20} aria-hidden="true" />
        </IconLink>
      )}
      {instagram && (
        <IconLink href={instagram} label="Instagram" className="contact-instagram">
          <Instagram size={20} aria-hidden="true" />
        </IconLink>
      )}
      {x && (
        <IconLink href={x} label="X" className="contact-x">
          <XLogo />
        </IconLink>
      )}
    </div>
  );
}

export default HotelContactsList;
