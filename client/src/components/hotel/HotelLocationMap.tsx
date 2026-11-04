import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ExternalLink } from 'lucide-react';

const defaultPinIcon = L.divIcon({
  className: 'custom-map-pin',
  html: `<svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 0C7.163 0 0 7.163 0 16c0 11.25 14.25 24.75 15.375 25.8a1 1 0 001.25 0C17.75 40.75 32 27.25 32 16c0-8.837-7.163-16-16-16z" fill="#0d9488"/>
    <circle cx="16" cy="16" r="6" fill="#ffffff"/>
  </svg>`,
  iconSize: [32, 42],
  iconAnchor: [16, 42],
  popupAnchor: [0, -36],
});

export interface HotelLocationMapProps {
  latitude: number;
  longitude: number;
  hotelName?: string;
  className?: string;
  navLabel?: string;
}

export function HotelLocationMap({ latitude, longitude, hotelName, className, navLabel = 'นำทางด้วย Google Maps' }: HotelLocationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [latitude, longitude],
      zoom: 15,
      scrollWheelZoom: false, // Prevent scroll trapping on phones and desktops
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    const marker = L.marker([latitude, longitude], { icon: defaultPinIcon }).addTo(map);
    if (hotelName) {
      marker.bindPopup(`<strong>${hotelName}</strong>`);
    }

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [latitude, longitude, hotelName]);

  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

  return (
    <div className={`hotel-location-map-wrapper ${className ?? ''}`} style={{ marginTop: 16 }}>
      <div
        ref={mapContainerRef}
        style={{
          width: '100%',
          height: 260,
          borderRadius: 12,
          border: '1px solid var(--color-border, #e4e4e7)',
          overflow: 'hidden',
          zIndex: 1,
        }}
      />
      <div style={{ marginTop: 10, textAlign: 'right' }}>
        <a
          href={navUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="button button-secondary google-maps-nav-link"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}
        >
          <span>{navLabel}</span>
          <ExternalLink size={14} />
        </a>
      </div>
    </div>
  );
}

export default HotelLocationMap;
