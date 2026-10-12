import { describe, expect, it } from 'vitest';
import { getAvailableRoomCount, getBookedRoomCountForDate, getOtaBlockedRoomCountForDate } from './calendarAvailability';

describe('calendar booking occupancy', () => {
  it('subtracts occupying bookings for the selected room type and night', () => {
    const booked = getBookedRoomCountForDate('rt-1', '2026-10-10', [
      { id: 'room-1', room_type_id: 'rt-1' },
      { id: 'room-2', room_type_id: 'rt-1' },
      { id: 'room-3', room_type_id: 'rt-2' },
    ], [
      { room_id: 'room-1', check_in: '2026-10-10', check_out: '2026-10-12', status: 'confirmed', expires_at: null },
      { room_id: 'room-2', check_in: '2026-10-11', check_out: '2026-10-12', status: 'confirmed', expires_at: null },
      { room_id: 'room-3', check_in: '2026-10-10', check_out: '2026-10-12', status: 'confirmed', expires_at: null },
      { room_id: 'room-2', check_in: '2026-10-10', check_out: '2026-10-12', status: 'cancelled', expires_at: null },
    ]);

    expect(booked).toBe(1);
    expect(getAvailableRoomCount(2, 2, booked)).toBe(1);
  });

  it('does not report negative availability when bookings exceed the remaining allotment', () => {
    expect(getAvailableRoomCount(2, 1, 2)).toBe(0);
  });

  it('counts a room once if legacy data has overlapping bookings for it', () => {
    expect(getBookedRoomCountForDate('rt-1', '2026-10-03', [
      { id: 'room-1', room_type_id: 'rt-1' },
    ], [
      { room_id: 'room-1', check_in: '2026-10-01', check_out: '2026-10-04', status: 'confirmed', expires_at: null },
      { room_id: 'room-1', check_in: '2026-10-02', check_out: '2026-10-05', status: 'confirmed', expires_at: null },
    ])).toBe(1);
  });
});

describe('OTA imported iCal blocks', () => {
  it('counts one blocked room when the room type / night is blocked', () => {
    const blocks = [
      { room_type_id: 'rt-1', date: '2026-10-10' },
      { room_type_id: 'rt-2', date: '2026-10-10' },
      { room_type_id: 'rt-1', date: '2026-10-11' },
    ];
    expect(getOtaBlockedRoomCountForDate('rt-1', '2026-10-10', blocks)).toBe(1);
    expect(getOtaBlockedRoomCountForDate('rt-2', '2026-10-11', blocks)).toBe(0);
  });

  it('counts every blocked room when several OTA reservations share a night', () => {
    const blocks = [
      { room_type_id: 'rt-1', date: '2026-10-10' },
      { room_type_id: 'rt-1', date: '2026-10-10' },
      { room_type_id: 'rt-1', date: '2026-10-11' },
    ];
    expect(getOtaBlockedRoomCountForDate('rt-1', '2026-10-10', blocks)).toBe(2);
    expect(getOtaBlockedRoomCountForDate('rt-1', '2026-10-11', blocks)).toBe(1);
  });

  it('subtracts imported OTA blocks from availability without going negative', () => {
    // 3 physical rooms, allotment 3, 1 booked, 1 OTA-blocked night -> 1 left.
    expect(getAvailableRoomCount(3, 3, 1, 1)).toBe(1);
    // Blocks never push availability below zero.
    expect(getAvailableRoomCount(2, 2, 1, 2)).toBe(0);
    // Defaults keep the old two/three-argument calls working.
    expect(getAvailableRoomCount(2, 2, 1)).toBe(1);
  });
});
