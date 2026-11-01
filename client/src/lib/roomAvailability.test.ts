import { describe, expect, it } from 'vitest';
import { availableRoomsForStay } from './roomAvailability';

const rooms = [
  { id: 'r101', room_number: '101', room_type_id: 't', status: 'available' },
  { id: 'r102', room_number: '102', room_type_id: 't', status: 'occupied' },
  { id: 'r103', room_number: '103', room_type_id: 't', status: 'maintenance' },
];
const ids = (list: { id: string }[]) => list.map(r => r.id);

describe('availableRoomsForStay', () => {
  it('keeps the other rooms when one room is booked over the dates (regression)', () => {
    const bookings = [{ id: 'b', room_id: 'r101', check_in: '2026-11-01', check_out: '2026-11-03', status: 'confirmed' }];
    expect(ids(availableRoomsForStay(rooms, bookings, '2026-11-02', '2026-11-04'))).toEqual(['r102']);
  });

  it('removes a room whose booking overlaps, with check-out exclusive', () => {
    const bookings = [{ id: 'b', room_id: 'r101', check_in: '2026-11-01', check_out: '2026-11-03', status: 'checked_in' }];
    expect(ids(availableRoomsForStay(rooms, bookings, '2026-11-02', '2026-11-03'))).not.toContain('r101');
    expect(ids(availableRoomsForStay(rooms, bookings, '2026-11-03', '2026-11-05'))).toContain('r101');
    expect(ids(availableRoomsForStay(rooms, bookings, '2026-10-30', '2026-11-01'))).toContain('r101');
  });

  it.each(['held', 'pending_payment', 'pending_verification', 'confirmed', 'checked_in'])('a %s booking blocks its room', status => {
    const bookings = [{ id: 'b', room_id: 'r101', check_in: '2026-11-01', check_out: '2026-11-03', status }];
    expect(ids(availableRoomsForStay(rooms, bookings, '2026-11-01', '2026-11-02'))).not.toContain('r101');
  });

  it.each(['cancelled', 'expired', 'payment_rejected', 'refunded', 'refund_pending', 'checked_out'])('a %s booking frees its room', status => {
    const bookings = [{ id: 'b', room_id: 'r101', check_in: '2026-11-01', check_out: '2026-11-03', status }];
    expect(ids(availableRoomsForStay(rooms, bookings, '2026-11-01', '2026-11-02'))).toContain('r101');
  });

  it('ignores bookings with no room', () => {
    const bookings = [{ id: 'b', room_id: null, check_in: '2026-11-01', check_out: '2026-11-03', status: 'confirmed' }];
    expect(ids(availableRoomsForStay(rooms, bookings, '2026-11-01', '2026-11-02'))).toEqual(['r101', 'r102']);
  });

  it('never offers a room under maintenance, and nothing for invalid dates', () => {
    expect(ids(availableRoomsForStay(rooms, [], '2026-11-01', '2026-11-02'))).not.toContain('r103');
    expect(availableRoomsForStay(rooms, [], '2026-11-02', '2026-11-02')).toEqual([]);
    expect(availableRoomsForStay(rooms, [], '', '2026-11-02')).toEqual([]);
  });
});
