import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ httpBatchLink: vi.fn(options => options), createClient: vi.fn(options => options) }));
vi.mock('@trpc/client', () => ({ httpBatchLink: mocks.httpBatchLink }));
vi.mock('@/lib/trpc', () => ({ trpc: { createClient: mocks.createClient } }));
vi.mock('./App', () => ({ default: () => null }));
import { createTrpcClient, getTrpcHeaders, queryClient, trpcClient } from './main';
afterEach(() => vi.unstubAllGlobals());
describe('Better Auth tRPC bootstrap port', () => {
  it('creates clients without a DOM and resolves concurrent cookie-session headers', async () => {
    expect(typeof document).toBe('undefined');
    expect(queryClient).toBeDefined();
    expect(trpcClient).toBeDefined();
    expect(createTrpcClient()).toBeDefined();
    expect(await Promise.all(Array.from({ length: 100 }, () => getTrpcHeaders()))).toEqual(Array.from({ length: 100 }, () => ({})));
  });
  it('forwards requests with credentials include for Better Auth cookies', async () => {
    const response = new Response('{}', { status: 200 });
    const fetch = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetch);
    createTrpcClient();
    const options = mocks.httpBatchLink.mock.calls.at(-1)![0] as any;
    await expect(options.headers()).resolves.toEqual({});
    await expect(options.fetch('/api/trpc/test', { method: 'POST', credentials: 'omit', body: '{}' })).resolves.toBe(response);
    expect(fetch).toHaveBeenCalledWith('/api/trpc/test', { method: 'POST', credentials: 'include', body: '{}' });
  });
});
