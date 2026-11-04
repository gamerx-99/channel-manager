/** @vitest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HotelLocationMap } from './HotelLocationMap';

describe('HotelLocationMap', () => {
  it('renders Google Maps navigation link with correct destination coordinates and security attributes', () => {
    render(
      <HotelLocationMap
        latitude={19.301234}
        longitude={97.971234}
        hotelName="Test Hotel"
        navLabel="นำทางด้วย Google Maps"
      />
    );

    const link = screen.getByRole('link', { name: /นำทางด้วย Google Maps/i });
    expect(link.getAttribute('href')).toBe('https://www.google.com/maps/dir/?api=1&destination=19.301234,97.971234');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
