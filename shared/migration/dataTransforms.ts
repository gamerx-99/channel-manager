import { getStayDates } from "../stayDates";

/**
 * Validates and converts various timestamp inputs (Date, ISO string, epoch ms)
 * to integer epoch milliseconds required by D1's timestamp_ms mode.
 */
export function toTimestampMs(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") {
    if (!Number.isFinite(val) || val < 0) return null;
    // If it's already in seconds (< 10000000000), convert to ms
    return val < 10_000_000_000 ? Math.round(val * 1000) : Math.round(val);
  }
  if (val instanceof Date) {
    const time = val.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return null;
    // If purely digits, parse as integer
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      return num < 10_000_000_000 ? num * 1000 : num;
    }
    const parsed = new Date(trimmed).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Converts boolean, number, or string truthy representations to SQLite integer (0 or 1).
 */
export function toBooleanInt(val: unknown): number {
  if (val === true || val === 1 || val === "1" || val === "true" || val === "t") return 1;
  return 0;
}

/**
 * Ensures input is serialised to valid JSON string text for SQLite json columns.
 */
export function toJsonText(val: unknown, fallback = "[]"): string {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "string") {
    try {
      JSON.parse(val);
      return val;
    } catch {
      return JSON.stringify(val);
    }
  }
  try {
    return JSON.stringify(val);
  } catch {
    return fallback;
  }
}

/**
 * Validates whether a value matches the D1 money text check constraint:
 * typeof(value) = 'text' and value <> ''
 * and value not glob '*[^0-9.]*' and value not glob '*.*.*'
 * and (instr(value, '.') = 0 or (instr(value, '.') > 1 and length(substr) between 1 and 2))
 * and cast(value as numeric) >= 0
 */
export function isValidMoneyText(val: unknown): boolean {
  if (typeof val !== "string" || !val) return false;
  // Must match integer or decimal with 1-2 digits, starting with at least one digit before '.'
  if (!/^\d+(\.\d{1,2})?$/.test(val)) return false;
  const num = Number(val);
  return Number.isFinite(num) && num >= 0;
}

/**
 * Converts arbitrary numeric or money string inputs to canonical 2-decimal money text.
 */
export function toMoneyText(val: unknown, fallback = "0.00"): string {
  if (val === null || val === undefined || val === "") return fallback;
  if (typeof val === "number") {
    if (!Number.isFinite(val) || val < 0) return fallback;
    return val.toFixed(2);
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (isValidMoneyText(trimmed)) {
      // Normalize to 2 decimal places if needed (e.g. '10.5' -> '10.50', '10' -> '10.00')
      const parts = trimmed.split(".");
      if (parts.length === 1) return `${parts[0]}.00`;
      if (parts[1].length === 1) return `${parts[0]}.${parts[1]}0`;
      return trimmed;
    }
    const num = Number(trimmed);
    if (Number.isFinite(num) && num >= 0) {
      return num.toFixed(2);
    }
  }
  return fallback;
}

/**
 * Rewrites a Supabase Storage URL or raw file path to Cloudflare R2 /media/<hotelId>/<file> route.
 * Validates extension against supported raster and vector image formats.
 */
export function rewriteMediaUrl(originalUrl: string, hotelId: string): string {
  if (!originalUrl || !hotelId) throw new Error("Both originalUrl and hotelId are required");

  // Extract filename portion
  // e.g. https://.../hotel-media/<hotel_id>/<file.png> or <hotel_id>/<file.png> or <file.png>
  let clean = originalUrl.trim();
  // Strip query string if any
  clean = clean.split("?")[0];

  const marker = "hotel-media/";
  const markerIdx = clean.indexOf(marker);
  if (markerIdx !== -1) {
    clean = clean.slice(markerIdx + marker.length);
  }

  // Remove leading slash or hotelId prefix if already present
  if (clean.startsWith("/")) clean = clean.slice(1);
  if (clean.startsWith(`${hotelId}/`)) {
    clean = clean.slice(hotelId.length + 1);
  }

  const filename = clean.split("/").pop() ?? clean;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(ext)) {
    throw new Error(`Unsupported media extension: .${ext} in ${originalUrl}`);
  }

  return `/media/${hotelId}/${filename}`;
}

export interface BookingInput {
  id: string;
  hotelId?: string;
  roomId: string | null;
  checkIn: string;
  checkOut: string;
  status: string;
  expiresAt?: number | null;
}

export interface NightRow {
  bookingId: string;
  roomId: string;
  night: string;
}

export interface OverlapConflict {
  bookingIdA: string;
  bookingIdB: string;
  roomId: string;
  night: string;
}

/**
 * Expands occupying bookings and active holds into individual (room_id, night) rows
 * and detects any overlapping double-bookings, mirroring D1's recursive CTE and
 * unique constraint uq_booking_nights_room_night.
 */
export function expandBookingNights(
  bookings: BookingInput[],
  nowMs: number = Date.now(),
): { nights: NightRow[]; conflicts: OverlapConflict[] } {
  const nights: NightRow[] = [];
  const conflicts: OverlapConflict[] = [];
  const occupiedMap = new Map<string, string>(); // key: `${roomId}:${night}` -> bookingId

  for (const b of bookings) {
    if (!b.roomId) continue;

    // Occupying status check
    const isOccupying =
      b.status === "confirmed" ||
      b.status === "checked_in" ||
      ((b.status === "held" || b.status === "pending_payment" || b.status === "pending_verification") &&
        (b.expiresAt == null || b.expiresAt >= nowMs));

    if (!isOccupying) continue;

    const stayDates = getStayDates(b.checkIn, b.checkOut);
    for (const night of stayDates) {
      const key = `${b.roomId}:${night}`;
      const existingBookingId = occupiedMap.get(key);
      if (existingBookingId) {
        conflicts.push({
          bookingIdA: existingBookingId,
          bookingIdB: b.id,
          roomId: b.roomId,
          night,
        });
      } else {
        occupiedMap.set(key, b.id);
        nights.push({
          bookingId: b.id,
          roomId: b.roomId,
          night,
        });
      }
    }
  }

  return { nights, conflicts };
}

/**
 * Table-specific column type definition maps to automate batch conversions.
 */
export const TABLE_COLUMN_TYPES: Record<
  string,
  {
    timestamps?: string[];
    booleans?: string[];
    money?: string[];
    json?: string[];
  }
> = {
  agents: {
    timestamps: ["created_at"],
  },
  hotels: {
    timestamps: ["created_at"],
    booleans: ["public_enabled"],
  },
  hotel_users: {
    timestamps: ["created_at"],
    json: ["permission_grants", "permission_revokes"],
  },
  hotel_media: {
    timestamps: ["created_at"],
    booleans: ["is_hero"],
  },
  room_types: {
    timestamps: ["created_at"],
    money: ["base_price"],
    booleans: ["children_count_toward_max"],
  },
  rooms: {
    timestamps: ["created_at"],
    money: ["price"],
  },
  ota_connections: {
    timestamps: ["created_at", "last_sync_at"],
  },
  bookings: {
    timestamps: ["created_at", "updated_at", "expires_at"],
    money: ["price"],
    booleans: ["late_payment"],
  },
  guests: {
    timestamps: ["created_at"],
    booleans: ["marketing_consent"],
  },
  availability: {
    timestamps: ["created_at"],
  },
  hotel_domains: {
    timestamps: ["created_at", "verified_at"],
    booleans: ["verified"],
  },
  ota_sync_logs: {
    timestamps: ["created_at"],
  },
  service_accounts: {
    timestamps: ["created_at", "expires_at"],
  },
  room_housekeeping_status: {
    timestamps: ["updated_at"],
  },
  hotel_admin_audit_logs: {
    timestamps: ["created_at"],
    json: ["changes"],
  },
  hotel_signup_links: {
    timestamps: ["created_at", "expires_at", "used_at"],
  },
  rate_overrides: {
    timestamps: ["created_at"],
    money: ["override_price"],
  },
  housekeeping_tasks: {
    timestamps: ["created_at", "updated_at"],
  },
  message_threads: {
    timestamps: ["created_at", "updated_at"],
  },
  messages: {
    timestamps: ["created_at"],
    booleans: ["is_read"],
  },
  hotel_site_config: {
    timestamps: ["created_at", "updated_at"],
    booleans: ["enabled"],
    json: ["amenities", "policies", "social_links", "contact_info"],
  },
  hotel_payment_settings: {
    timestamps: ["created_at", "updated_at"],
    booleans: ["slipok_enabled"],
  },
  notifications: {
    timestamps: ["created_at"],
    booleans: ["is_read"],
    json: ["metadata"],
  },
  booking_services: {
    timestamps: ["created_at"],
    money: ["unit_price", "total_price"],
  },
  payment_sessions: {
    timestamps: ["created_at", "updated_at", "expires_at"],
    money: ["amount"],
  },
  booking_status_log: {
    timestamps: ["created_at"],
  },
  hotel_services: {
    timestamps: ["created_at", "updated_at"],
    money: ["unit_price"],
    booleans: ["is_active"],
  },
  support_access_grants: {
    timestamps: ["created_at", "expires_at", "revoked_at"],
  },
  support_access_log: {
    timestamps: ["created_at"],
  },
  user: {
    timestamps: ["createdAt", "updatedAt", "banExpires"],
    booleans: ["emailVerified", "twoFactorEnabled", "banned"],
  },
  session: {
    timestamps: ["createdAt", "updatedAt", "expiresAt"],
  },
  account: {
    timestamps: ["createdAt", "updatedAt", "accessTokenExpiresAt", "refreshTokenExpiresAt"],
  },
};

/**
 * Transforms a raw Supabase/PostgreSQL record to conform strictly with Cloudflare D1 types.
 */
export function transformRecordForD1(
  tableName: string,
  record: Record<string, unknown>,
): Record<string, unknown> {
  const config = TABLE_COLUMN_TYPES[tableName];
  if (!config) return { ...record };

  const transformed: Record<string, unknown> = { ...record };

  // Timestamps -> epoch milliseconds
  if (config.timestamps) {
    for (const col of config.timestamps) {
      if (col in transformed) {
        transformed[col] = toTimestampMs(transformed[col]);
      }
    }
  }

  // Booleans -> 0 | 1
  if (config.booleans) {
    for (const col of config.booleans) {
      if (col in transformed) {
        transformed[col] = toBooleanInt(transformed[col]);
      }
    }
  }

  // Money -> canonical 'X.XX' text
  if (config.money) {
    for (const col of config.money) {
      if (col in transformed) {
        transformed[col] = toMoneyText(transformed[col]);
      }
    }
  }

  // JSON -> valid JSON text string
  if (config.json) {
    for (const col of config.json) {
      if (col in transformed) {
        transformed[col] = toJsonText(transformed[col], "[]");
      }
    }
  }

  // Special case: hotel_media URL rewrite
  if (tableName === "hotel_media" && typeof transformed.url === "string") {
    const hotelId = String(transformed.hotel_id ?? "");
    if (hotelId) {
      transformed.url = rewriteMediaUrl(transformed.url, hotelId);
    }
  }

  return transformed;
}
