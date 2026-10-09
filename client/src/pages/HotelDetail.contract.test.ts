import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Hotel Detail calendar navigation', () => {
  const hotelDetail = readFileSync(resolve(process.cwd(), 'client/src/pages/HotelDetail.tsx'), 'utf8');
  const app = readFileSync(resolve(process.cwd(), 'client/src/App.tsx'), 'utf8');

  it('links availability to the registered calendar route', () => {
    expect(hotelDetail).toContain('href={`/hotels/${hotel.id}/calendar`}');
    expect(hotelDetail).not.toContain('href={`/hotels/${hotel.id}/availability`}');
    expect(app).toContain('path="/hotels/:id/calendar"');
  });
});
