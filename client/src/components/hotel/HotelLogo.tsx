import React from "react";

/** The hotel's logo in the website header. With no logo it draws nothing (no placeholder). */
export function HotelLogo({ url, name, className = "" }: { url?: string | null; name?: string; className?: string }) {
  if (!url) return null;
  return <img className={`hotel-logo ${className}`.trim()} src={url} alt={name ?? ""} />;
}

export default HotelLogo;
