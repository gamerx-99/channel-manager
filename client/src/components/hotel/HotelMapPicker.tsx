import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { parseCoordinatePaste } from '@shared/hotelLocationRules';

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

export interface HotelMapPickerProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (coords: { latitude: number | null; longitude: number | null }) => void;
  disabled?: boolean;
}

const DEFAULT_CENTER: [number, number] = [19.30, 97.97]; // Mae Hong Son
const DEFAULT_ZOOM = 13;

export function HotelMapPicker({ latitude, longitude, onChange, disabled }: HotelMapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const hasCoords = typeof latitude === 'number' && typeof longitude === 'number' && !Number.isNaN(latitude) && !Number.isNaN(longitude);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initialCenter: [number, number] = hasCoords ? [latitude!, longitude!] : DEFAULT_CENTER;
    const initialZoom = hasCoords ? 15 : DEFAULT_ZOOM;

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    map.on('click', (event: L.LeafletMouseEvent) => {
      if (disabled) return;
      const { lat, lng } = event.latlng;
      const nextLat = Number(lat.toFixed(6));
      const nextLng = Number(lng.toFixed(6));
      onChange({ latitude: nextLat, longitude: nextLng });
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Sync marker with coordinates
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (hasCoords) {
      const pos: [number, number] = [latitude!, longitude!];
      if (!markerRef.current) {
        const marker = L.marker(pos, {
          icon: defaultPinIcon,
          draggable: !disabled,
        }).addTo(map);

        marker.on('dragend', () => {
          const latlng = marker.getLatLng();
          onChange({
            latitude: Number(latlng.lat.toFixed(6)),
            longitude: Number(latlng.lng.toFixed(6)),
          });
        });

        markerRef.current = marker;
      } else {
        markerRef.current.setLatLng(pos);
        markerRef.current.options.draggable = !disabled;
      }
    } else {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
    }
  }, [latitude, longitude, hasCoords, disabled]);

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData('text');
    const parsed = parseCoordinatePaste(text);
    if (parsed) {
      event.preventDefault();
      onChange(parsed);
      if (mapInstanceRef.current && parsed.latitude != null && parsed.longitude != null) {
        mapInstanceRef.current.setView([parsed.latitude, parsed.longitude], 15);
      }
    }
  }

  function handleLatitudeChange(val: string) {
    if (val === '') {
      onChange({ latitude: null, longitude });
      return;
    }
    const num = Number(val);
    if (!Number.isNaN(num)) {
      onChange({ latitude: num, longitude });
    }
  }

  function handleLongitudeChange(val: string) {
    if (val === '') {
      onChange({ latitude, longitude: null });
      return;
    }
    const num = Number(val);
    if (!Number.isNaN(num)) {
      onChange({ latitude, longitude: num });
    }
  }

  function handleClear() {
    onChange({ latitude: null, longitude: null });
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }
  }

  return (
    <div
      className="hotel-map-picker"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="hotel-map-picker-heading">
        <span className="hotel-map-picker-title">ตำแหน่งที่ตั้งบนแผนที่</span>
        {hasCoords && (
          <button
            type="button"
            className="button button-quiet hotel-map-picker-clear"
            onClick={handleClear}
            disabled={disabled}
          >
            ล้างตำแหน่ง
          </button>
        )}
      </div>

      <div className="hotel-map-coordinates">
        <label>
          ละติจูด
          <input
            type="number"
            step="0.000001"
            min="-90"
            max="90"
            placeholder="เช่น 19.300000"
            value={latitude ?? ''}
            onChange={(e) => handleLatitudeChange(e.target.value)}
            onPaste={handlePaste}
            disabled={disabled}
          />
        </label>
        <label>
          ลองจิจูด
          <input
            type="number"
            step="0.000001"
            min="-180"
            max="180"
            placeholder="เช่น 97.970000"
            value={longitude ?? ''}
            onChange={(e) => handleLongitudeChange(e.target.value)}
            onPaste={handlePaste}
            disabled={disabled}
          />
        </label>
      </div>
      <p className="hotel-map-picker-hint">
        เคล็ดลับ: สามารถวางพิกัด "19.30, 97.97" ในช่องใดช่องหนึ่งเพื่อแยกพิกัดอัตโนมัติ
      </p>

      <div
        ref={mapContainerRef}
        className="hotel-map-canvas"
      />
      <small className="hotel-map-picker-help">
        คลิกบนแผนที่หรือลากหมุดเพื่อระบุตำแหน่งโรงแรม
      </small>
    </div>
  );
}

export default HotelMapPicker;
