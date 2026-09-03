import React from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';

export interface BookingDateRangePickerProps {
  /** ISO date string (YYYY-MM-DD) or null/undefined if not yet selected. */
  checkIn: string | null | undefined;
  /** ISO date string (YYYY-MM-DD) or null/undefined if not yet selected. */
  checkOut: string | null | undefined;
  /** Called with the new {checkIn, checkOut} pair (either may be null) after any day click. */
  onChange: (range: { checkIn: string | null; checkOut: string | null }) => void;
  /** Earliest selectable date, ISO string. Defaults to today. */
  minDateIso?: string;
  /** Hex color driving the selected/range highlight, matching the hotel's public-page accent. */
  accentColor?: string;
}

/**
 * Formats a Date as a local YYYY-MM-DD string. Deliberately NOT `date.toISOString().slice(0, 10)`
 * — react-day-picker hands back Date objects at local midnight, and toISOString() converts to
 * UTC, which shifts the date backward by one day for any positive UTC offset (including
 * Thailand's UTC+7, which this app is built for).
 */
function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function BookingDateRangePicker({
  checkIn,
  checkOut,
  onChange,
  minDateIso,
  accentColor,
}: BookingDateRangePickerProps) {
  function handleDayClick(day: Date) {
    const dayIso = toLocalIsoDate(day);
    if (!checkIn || (checkIn && checkOut)) {
      // Click 1 (nothing selected yet) OR click 3 (a full range is already selected) — start a new cycle.
      onChange({ checkIn: dayIso, checkOut: null });
      return;
    }
    // checkIn is set, checkOut is not — this is click 2.
    if (dayIso <= checkIn) {
      // Clicked on or before the current check-in — treat as a fresh click 1, not an invalid click 2.
      onChange({ checkIn: dayIso, checkOut: null });
    } else {
      onChange({ checkIn, checkOut: dayIso });
    }
  }

  return (
    <div
      className="booking-calendar"
      style={accentColor ? ({ '--booking-calendar-accent': accentColor } as React.CSSProperties) : undefined}
    >
      <DayPicker
        mode="range"
        selected={{
          from: checkIn ? new Date(`${checkIn}T00:00:00`) : undefined,
          to: checkOut ? new Date(`${checkOut}T00:00:00`) : undefined,
        }}
        onDayClick={handleDayClick}
        disabled={{ before: minDateIso ? new Date(`${minDateIso}T00:00:00`) : new Date(new Date().toDateString()) }}
        showOutsideDays
      />
    </div>
  );
}
