import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HotelContactsList } from './HotelContactsList';

describe('HotelContactsList', () => {
  it('renders nothing when all contacts are null or empty', () => {
    const html = renderToStaticMarkup(<HotelContactsList />);
    expect(html).toBe('');
  });

  it('renders phone link with tel: protocol', () => {
    const html = renderToStaticMarkup(<HotelContactsList phone="081 234 5678" />);
    expect(html).toContain('href="tel:081 234 5678"');
    expect(html).toContain('081 234 5678');
  });

  it('renders social links with noopener noreferrer and target blank', () => {
    const html = renderToStaticMarkup(
      <HotelContactsList
        facebookUrl="https://facebook.com/myhotel"
        instagramUrl="https://instagram.com/myhotel"
        xUrl="https://x.com/myhotel"
      />
    );

    expect(html).toContain('href="https://facebook.com/myhotel"');
    expect(html).toContain('href="https://instagram.com/myhotel"');
    expect(html).toContain('href="https://x.com/myhotel"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  it('renders LINE link after phone, before Facebook', () => {
    const html = renderToStaticMarkup(
      <HotelContactsList
        phone="081 234 5678"
        lineUrl="https://line.me/R/ti/p/@hotel"
        facebookUrl="https://facebook.com/myhotel"
      />
    );
    expect(html).toContain('href="https://line.me/R/ti/p/@hotel"');
    expect(html.indexOf('aria-label="LINE"')).toBeLessThan(html.indexOf('aria-label="Facebook"'));
    expect(html.indexOf('tel:')).toBeLessThan(html.indexOf('aria-label="LINE"'));
  });

  it('shows icons instead of text labels and only for channels that are set', () => {
    const html = renderToStaticMarkup(
      <HotelContactsList phone="081 234 5678" facebookUrl="https://facebook.com/h" instagramUrl="https://instagram.com/h" />
    );
    expect(html).toContain('lucide-phone');
    expect(html).toContain('lucide-facebook');
    expect(html).toContain('lucide-instagram');
    expect(html).not.toContain('>Facebook<');
    expect(html).not.toContain('>Instagram<');
    expect(html).not.toContain('contact-x');
    expect(html).not.toContain('contact-line');
  });

  it('draws the X logo when an X link is set', () => {
    const html = renderToStaticMarkup(<HotelContactsList xUrl="https://x.com/h" />);
    expect(html).toContain('contact-x');
    expect(html).toContain('<svg');
    expect(html).not.toContain('>X<');
  });
});
