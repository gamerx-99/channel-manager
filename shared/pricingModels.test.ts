import { describe, it, expect } from 'vitest';
import { calculateServiceTotal, calculateGrandTotal, calcNights, type BookingServiceInput } from './pricingModels';

describe('Pricing Models Calculations', () => {
  describe('calcNights', () => {
    it('calculates nights correctly between two ISO dates', () => {
      expect(calcNights('2026-08-10', '2026-08-12')).toBe(2);
      expect(calcNights('2026-08-10', '2026-08-11')).toBe(1);
    });
    
    it('returns 0 for invalid or backward dates', () => {
      expect(calcNights('2026-08-12', '2026-08-10')).toBe(0);
      expect(calcNights('2026-08-10', '2026-08-10')).toBe(0);
      expect(calcNights('invalid', '2026-08-10')).toBe(0);
    });
  });

  describe('calculateServiceTotal', () => {
    it('calculates PER_PERSON_PER_NIGHT', () => {
      const service: BookingServiceInput = {
        service_name: 'Breakfast',
        pricing_model: 'PER_PERSON_PER_NIGHT',
        unit_price: 150,
        quantity: 2,
      };
      expect(calculateServiceTotal(service, 3)).toBe(150 * 2 * 3); // 900
    });

    it('calculates PER_NIGHT', () => {
      const service: BookingServiceInput = {
        service_name: 'Extra Bed',
        pricing_model: 'PER_NIGHT',
        unit_price: 500,
        quantity: 1, // typically 1, but if they want 2 extra beds it multiplies
      };
      expect(calculateServiceTotal(service, 4)).toBe(500 * 1 * 4); // 2000
    });

    it('calculates ONE_TIME', () => {
      const service: BookingServiceInput = {
        service_name: 'Airport Transfer',
        pricing_model: 'ONE_TIME',
        unit_price: 800,
        quantity: 1,
      };
      // nights shouldn't matter
      expect(calculateServiceTotal(service, 5)).toBe(800 * 1); // 800
    });
  });

  describe('calculateGrandTotal', () => {
    it('sums room total and service totals correctly', () => {
      const services: BookingServiceInput[] = [
        { service_name: 'Breakfast', pricing_model: 'PER_PERSON_PER_NIGHT', unit_price: 150, quantity: 2 },
        { service_name: 'Airport Transfer', pricing_model: 'ONE_TIME', unit_price: 800, quantity: 1 }
      ];
      // 3 nights * 1000 base = 3000
      // Breakfast: 150 * 2 * 3 = 900
      // Airport Transfer: 800
      // Total: 3000 + 900 + 800 = 4700
      expect(calculateGrandTotal(1000, 3, services)).toBe(4700);
    });

    it('returns just room total if no services', () => {
      expect(calculateGrandTotal(1000, 3, [])).toBe(3000);
    });
  });
});
