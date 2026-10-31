import { afterEach, describe, expect, it, vi } from 'vitest';
import { observable } from '@trpc/server/observable';
vi.mock('@/lib/trpc', () => ({ trpc: { createClient: vi.fn(options => options) } }));
vi.mock('./App', () => ({ default: () => null }));
import { localizeErrorsLink } from './main';

function runWithError(message: string) {
  const failing = () => observable<never, Error>(observer => { observer.error(new Error(message)); });
  const link = (localizeErrorsLink as any)({});
  return new Promise<string>(resolve => {
    link({ op: {}, next: failing }).subscribe({ error: (error: Error) => resolve(error.message) });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('localizeErrorsLink', () => {
  it('shows a known server error in Thai when the app is in Thai', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'th' });
    await expect(runWithError('The selected room is no longer available for the requested dates.')).resolves.toBe('ห้องที่เลือกไม่ว่างแล้วในวันที่นี้');
  });

  it('keeps English, and unknown messages, unchanged', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'en' });
    await expect(runWithError('The selected room is no longer available for the requested dates.')).resolves.toBe('The selected room is no longer available for the requested dates.');
    vi.stubGlobal('localStorage', { getItem: () => 'th' });
    await expect(runWithError('Unexpected thing')).resolves.toBe('Unexpected thing');
  });
});
