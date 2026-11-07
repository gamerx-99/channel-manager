import { describe, expect, it } from 'vitest';
import { formFromHotel, profilePayload } from './useHotelProfileForm';

describe('hotel profile form mapping', () => {
  it('fills absent contacts and switches with empty values', () => {
    expect(formFromHotel({ name: 'Inn', address: null, show_line: null })).toMatchObject({
      name: 'Inn', address: '', line_url: '', show_line: false, latitude: null,
    });
  });

  it('keeps coordinates and converts empty optional channels to null in the payload', () => {
    const form = formFromHotel({ name: 'Inn', address: 'Road', owner_contact: 'Owner', latitude: 19.3, longitude: 97.97, line_url: '@inn', show_line: true });
    expect(profilePayload('h1', form)).toMatchObject({
      hotel_id: 'h1', name: 'Inn', address: 'Road', owner_contact: 'Owner',
      latitude: 19.3, longitude: 97.97, public_phone: null, facebook_url: null,
      line_url: '@inn', show_line: true, instagram_url: null, x_url: null,
    });
  });
});
