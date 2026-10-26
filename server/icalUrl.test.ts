import { describe, expect, it, vi } from 'vitest';
import {
  ICAL_URL_ERROR,
  assertPublicIcalUrl,
  fetchPublicIcalFeed,
  isPrivateAddress,
  isPublicIcalUrl,
} from './icalUrl';

const publicDns = async () => ['93.184.216.34'];

describe('iCal URL validation', () => {
  it('accepts public http(s) feed URLs', () => {
    expect(isPublicIcalUrl('https://www.airbnb.com/calendar/ical/123.ics?s=abc')).toBe(true);
    expect(isPublicIcalUrl('http://93.184.216.34/feed.ics')).toBe(true);
  });

  it.each([
    'not a url',
    'ftp://example.com/feed.ics',
    'file:///etc/passwd',
    'https://user:pass@example.com/feed.ics',
    'http://localhost/feed.ics',
    'http://app.localhost/feed.ics',
    'http://127.0.0.2/feed.ics',
    'http://2130706433/feed.ics',
    'http://0x7f.1/feed.ics',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.5/feed.ics',
    'http://172.20.1.1/feed.ics',
    'http://192.168.1.10/feed.ics',
    'http://100.64.0.1/feed.ics',
    'http://0.0.0.0/feed.ics',
    'http://[::1]/feed.ics',
    'http://[fd00::1]/feed.ics',
    'http://[fe80::1]/feed.ics',
    'http://[::ffff:127.0.0.1]/feed.ics',
  ])('rejects %s', (url) => {
    expect(isPublicIcalUrl(url)).toBe(false);
  });

  it('classifies private and public addresses', () => {
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
    expect(isPrivateAddress('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('2606:4700::1111')).toBe(false);
  });

  it('rejects a public hostname that resolves to a private address', async () => {
    await expect(assertPublicIcalUrl('https://evil.example/feed.ics', async () => ['10.0.0.8']))
      .rejects.toThrow(ICAL_URL_ERROR);
    await expect(assertPublicIcalUrl('https://evil.example/feed.ics', async () => ['93.184.216.34', '127.0.0.1']))
      .rejects.toThrow(ICAL_URL_ERROR);
  });

  it('reports an unresolvable host', async () => {
    await expect(assertPublicIcalUrl('https://missing.example/feed.ics', async () => { throw new Error('ENOTFOUND'); }))
      .rejects.toThrow('Could not resolve the iCal feed host missing.example.');
  });
});

describe('fetchPublicIcalFeed', () => {
  it('follows a redirect to another public URL', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://cdn.example.com/feed.ics' } }))
      .mockResolvedValueOnce(new Response('BEGIN:VCALENDAR', { status: 200 }));

    const response = await fetchPublicIcalFeed('https://example.com/feed.ics', { fetchImpl, resolveHost: publicDns });

    expect(await response.text()).toBe('BEGIN:VCALENDAR');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
    expect(fetchImpl.mock.calls[1][0]).toBe('https://cdn.example.com/feed.ics');
  });

  it('refuses a redirect to an internal address', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }));

    await expect(fetchPublicIcalFeed('https://example.com/feed.ics', { fetchImpl, resolveHost: publicDns }))
      .rejects.toThrow(ICAL_URL_ERROR);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('stops after too many redirects', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: '/again' } }));

    await expect(fetchPublicIcalFeed('https://example.com/feed.ics', { fetchImpl, resolveHost: publicDns }))
      .rejects.toThrow('redirected more than 3 times');
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});
