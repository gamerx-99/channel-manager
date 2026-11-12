/**
 * Phase 12B — Unit tests for SlipOK verification client.
 * Mocks the global fetch to avoid real HTTP calls.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { verifySlipWithSlipOk } from './slipVerification';

const FAKE_API_KEY = 'test-api-key-12345';
const FAKE_BRANCH_ID = 'test-branch-001';
const CREDENTIALS = { apiKey: FAKE_API_KEY, branchId: FAKE_BRANCH_ID };

/** Build a minimal Response-like object for fetch mocking */
function mockResponse(status: number, body: unknown): Response {
  const ok = status >= 200 && status < 300;
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers(),
    redirected: false,
    statusText: String(status),
    type: 'basic',
    url: '',
    clone: () => mockResponse(status, body),
    body: null,
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
  } as unknown as Response;
}

describe('verifySlipWithSlipOk', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends the branch ID in the URL and the API key in the x-authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      mockResponse(200, { success: true, data: { amount: 3500, transRef: 'TX-001' } }),
    );
    global.fetch = fetchMock;

    await verifySlipWithSlipOk(CREDENTIALS, {
      slipData: 'base64slipdata',
      expectedAmount: 3500,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.slipok.com/api/line/apikey/${FAKE_BRANCH_ID}`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-authorization': FAKE_API_KEY }),
      }),
    );
  });

  it('calls the right URL when the stored branch ID is the whole SlipOK API URL', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(mockResponse(200, { success: true, data: { amount: 1, transRef: 'TX-1' } }));
    global.fetch = fetchMock;
    await verifySlipWithSlipOk({ apiKey: FAKE_API_KEY, branchId: 'https://api.slipok.com/api/line/apikey/12345' }, { slipData: 'eA==', expectedAmount: 1 });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.slipok.com/api/line/apikey/12345');
  });

  it('does not call SlipOK with a branch value it cannot read', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;
    await expect(verifySlipWithSlipOk({ apiKey: FAKE_API_KEY, branchId: 'https://evil.example/1' }, { slipData: 'eA==', expectedAmount: 1 }))
      .rejects.toMatchObject({ code: 'INVALID_KEY' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // log: true makes SlipOK check the receiver bound to the hotel's branch.
  it('sends the image in files with amount and log', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      mockResponse(200, { success: true, data: { amount: 3500, transRef: 'TX-001' } }),
    );
    global.fetch = fetchMock;

    await verifySlipWithSlipOk(CREDENTIALS, { slipData: 'data:image/png;base64,iVBORw==', expectedAmount: 3500, contentType: 'image/png' });

    // SlipOK reads `files` only as a multipart file upload, never as base64 text in JSON.
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toEqual({ 'x-authorization': FAKE_API_KEY });
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    const file = form.get('files') as File;
    expect(file.type).toBe('image/png');
    expect([...new Uint8Array(await file.arrayBuffer())]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(form.get('log')).toBe('true');
    expect(form.get('amount')).toBe('3500');
  });

  it.each([1001, 1002])('treats SlipOK code %i as a hotel credentials problem', async code => {
    global.fetch = vi.fn().mockResolvedValueOnce(mockResponse(400, { code, message: 'bad' }));
    await expect(verifySlipWithSlipOk(CREDENTIALS, { slipData: 'eA==', expectedAmount: 1 })).rejects.toMatchObject({ code: 'INVALID_KEY' });
  });

  it('ignores the old SLIP_OK_API variable', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(mockResponse(200, { success: true, data: { amount: 100, transRef: 'TX-001' } }));
    global.fetch = fetchMock;
    vi.stubEnv('SLIP_OK_API', 'https://example.test');

    await verifySlipWithSlipOk(CREDENTIALS, { slipData: 'base64', expectedAmount: 100 });
    vi.unstubAllEnvs();

    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.slipok.com/api/line/apikey/${FAKE_BRANCH_ID}`);
  });

  it.each([1005, 1006, 1007, 1008])('asks for a new image on SlipOK code %i', async code => {
    global.fetch = vi.fn().mockResolvedValueOnce(mockResponse(400, { code, message: 'unreadable' }));

    await expect(
      verifySlipWithSlipOk(CREDENTIALS, { slipData: 'base64', expectedAmount: 100 }),
    ).rejects.toMatchObject({ code: 'UNREADABLE_SLIP' });
  });

  it.each([1011, 1012, 1013, 1014])('treats SlipOK code %i as a rejected slip', async code => {
    global.fetch = vi.fn().mockResolvedValueOnce(mockResponse(400, { code, message: 'rejected' }));

    const result = await verifySlipWithSlipOk(CREDENTIALS, { slipData: 'base64', expectedAmount: 100 });

    expect(result).toMatchObject({ matched: false, transactionRef: null, raw: { code } });
  });

  it.each([1003, 1004, 1009, 1010])('sends SlipOK code %i to manual review', async code => {
    global.fetch = vi.fn().mockResolvedValueOnce(mockResponse(400, { code, message: 'later' }));

    await expect(
      verifySlipWithSlipOk(CREDENTIALS, { slipData: 'base64', expectedAmount: 100 }),
    ).rejects.toMatchObject({ code: 'API_ERROR' });
  });

  it('does not match a slip with no transaction reference', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(mockResponse(200, { success: true, data: { amount: 100 } }));

    const result = await verifySlipWithSlipOk(CREDENTIALS, { slipData: 'base64', expectedAmount: 100 });

    expect(result.matched).toBe(false);
  });

  it('returns matched=true when SlipOK confirms payment with correct amount', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      mockResponse(200, { success: true, data: { amount: 3500, transRef: 'TX-001' } }),
    );

    const result = await verifySlipWithSlipOk(CREDENTIALS, {
      slipData: 'base64slipdata',
      expectedAmount: 3500,
    });

    expect(result.matched).toBe(true);
    expect(result.transactionRef).toBe('TX-001');
    expect(result.amount).toBe(3500);
  });

  it('returns matched=false when amount does not match', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      mockResponse(200, { success: true, data: { amount: 1000, transRef: 'TX-002' } }),
    );

    const result = await verifySlipWithSlipOk(CREDENTIALS, {
      slipData: 'base64slipdata',
      expectedAmount: 3500,
    });

    expect(result.matched).toBe(false);
  });

  it('allows ±0.01 THB tolerance for rounding', async () => {
    // Use 3500.005 → diff = 0.005 which is safely < 0.01 tolerance (no float precision issue)
    global.fetch = vi.fn().mockResolvedValueOnce(
      mockResponse(200, { success: true, data: { amount: 3500.005, transRef: 'TX-003' } }),
    );

    const result = await verifySlipWithSlipOk(CREDENTIALS, {
      slipData: 'base64',
      expectedAmount: 3500,
    });

    // |3500.005 - 3500| = 0.005 <= 0.01 → matched
    expect(result.matched).toBe(true);
  });


  it('throws SlipOkError with INVALID_KEY on 401', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse(401, { error: 'Unauthorized' }),
    );

    await expect(
      verifySlipWithSlipOk(CREDENTIALS, { slipData: 'base64', expectedAmount: 100 }),
    ).rejects.toMatchObject({ code: 'INVALID_KEY' });
  });

  it('throws SlipOkError with API_ERROR on non-401 HTTP error', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      mockResponse(500, {}),
    );

    await expect(
      verifySlipWithSlipOk(CREDENTIALS, { slipData: 'base64', expectedAmount: 100 }),
    ).rejects.toMatchObject({ code: 'API_ERROR' });
  });

  it('throws SlipOkError with API_ERROR on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

    await expect(
      verifySlipWithSlipOk(CREDENTIALS, { slipData: 'base64', expectedAmount: 100 }),
    ).rejects.toMatchObject({ code: 'API_ERROR' });
  });

  it('returns matched=false when success is false even if amount matches', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      mockResponse(200, { success: false, data: { amount: 3500, transRef: 'TX-FAIL' } }),
    );

    const result = await verifySlipWithSlipOk(CREDENTIALS, {
      slipData: 'base64',
      expectedAmount: 3500,
    });

    expect(result.matched).toBe(false);
  });
});
