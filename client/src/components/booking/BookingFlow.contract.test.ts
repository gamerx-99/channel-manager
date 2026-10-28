import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

describe('BookingFlow 5-step contract (spec 16-01)', () => {
  const flowSource = readFileSync(resolve(process.cwd(), 'client/src/components/booking/BookingFlow.tsx'), 'utf8');
  const publicHotelSource = readFileSync(resolve(process.cwd(), 'client/src/pages/PublicHotel.tsx'), 'utf8');
  const en = readFileSync(resolve(process.cwd(), 'client/src/lib/i18n/en.ts'), 'utf8');
  const th = readFileSync(resolve(process.cwd(), 'client/src/lib/i18n/th.ts'), 'utf8');

  it('has exactly 5 steps in the owner-defined order', () => {
    expect(flowSource).toContain('export const BOOKING_FLOW_TOTAL_STEPS = 5;');
    const markers = ['dates-room', 'add-ons', 'guest-info', 'summary', 'payment']
      .map(step => flowSource.indexOf(`data-booking-step="${step}"`));
    expect(markers.every(index => index >= 0)).toBe(true);
    expect([...markers].sort((a, b) => a - b)).toEqual(markers);
  });

  it('starts the hold from the dates + room step and confirms details from guest info', () => {
    const datesRoom = flowSource.indexOf('data-booking-step="dates-room"');
    const addOns = flowSource.indexOf('data-booking-step="add-ons"');
    const datesRoomBlock = flowSource.slice(datesRoom, addOns);
    expect(datesRoomBlock).toContain('BookingDateRangePicker');
    expect(datesRoomBlock).toContain('handleHoldRoom(rt.id)');
    expect(flowSource).toMatch(/holdRoomTypeMutation = [\s\S]*?setWizardStep\(2\)/);
    expect(flowSource).toMatch(/confirmDetailsMutation = [\s\S]*?setWizardStep\(4\)/);
    expect(flowSource).toContain('onSubmit={handleConfirmDetails}');
  });

  it('renders the summary before PaymentQR', () => {
    expect(flowSource.indexOf('data-booking-step="summary"')).toBeLessThan(flowSource.indexOf('<PaymentQR'));
  });

  it('styles itself only through --t-* variables with default fallbacks', () => {
    expect(flowSource).toContain('`var(--t-${name}, ${fallback})`');
    // The old dark-panel colours may appear once each, as the fallback in the tone table, and nowhere else.
    for (const colour of ['#d2e8de', '#e8eee8', '#6a7670', '#dfd8cb']) {
      expect(flowSource.split(colour).length - 1, colour).toBe(1);
    }
  });

  it('PublicHotel delegates the booking wizard to BookingFlow', () => {
    expect(publicHotelSource).toContain('<BookingFlow');
    expect(publicHotelSource).not.toContain('renderStepContent');
  });

  it('has TH and EN strings for every new key', () => {
    for (const key of ['chooseRoomTitle', 'holdNote', 'serviceUnitPerNight', 'serviceUnitPerPersonPerNight', 'serviceUnitOnce']) {
      expect(en).toContain(`${key}:`);
      expect(th).toContain(`${key}:`);
    }
  });
});
