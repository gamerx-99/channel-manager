/**
 * Phase 12B — Unit tests for SlipOK verification client.
 * Mocks the global fetch to avoid real HTTP calls.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkSlipReceiver, compareReceiverValue, getCentralSlipOkCredentials, localSlipOkBaseUrl, verifySlipWithSlipOk } from './slipVerification';

const FAKE_API_KEY = 'test-api-key-12345';
const FAKE_BRANCH_ID = 'test-branch-001';
const CREDENTIALS = { apiKey: FAKE_API_KEY, branchId: FAKE_BRANCH_ID };
const PROMPTPAY = '0812345678';
/** A slip whose receiver matches PROMPTPAY, as SlipOK masks it. */
const RECEIVER = { displayName: 'Hotel', proxy: { type: 'MSISDN', value: '081-xxx-5678' }, account: { value: 'xxx-x-x1234-x' } };

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
      mockResponse(200, { success: true, data: { amount: 3500, transRef: 'TX-001', receiver: RECEIVER } }),
    );
    global.fetch = fetchMock;

    await verifySlipWithSlipOk(CREDENTIALS, {
      slipData: 'base64slipdata',
      expectedAmount: 3500, expectedReceiver: PROMPTPAY,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.slipok.com/api/line/apikey/${FAKE_BRANCH_ID}`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-authorization': FAKE_API_KEY }),
      }),
    );
  });

  // log: true made SlipOK check the receiver bound to a hotel's own branch. The
  // central branch serves every hotel, so the receiver is checked here instead.
  it('sends the image in files with amount and without log', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      mockResponse(200, { success: true, data: { amount: 3500, transRef: 'TX-001', receiver: RECEIVER } }),
    );
    global.fetch = fetchMock;

    await verifySlipWithSlipOk(CREDENTIALS, { slipData: 'base64slipdata', expectedAmount: 3500, expectedReceiver: PROMPTPAY });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ files: 'base64slipdata', amount: 3500 });
  });

  it.each([1005, 1006, 1007, 1008])('asks for a new image on SlipOK code %i', async code => {
    global.fetch = vi.fn().mockResolvedValueOnce(mockResponse(400, { code, message: 'unreadable' }));

    await expect(
      verifySlipWithSlipOk(CREDENTIALS, { slipData: 'base64', expectedAmount: 100, expectedReceiver: PROMPTPAY }),
    ).rejects.toMatchObject({ code: 'UNREADABLE_SLIP' });
  });

  it.each([1011, 1012, 1013, 1014])('treats SlipOK code %i as a rejected slip', async code => {
    global.fetch = vi.fn().mockResolvedValueOnce(mockResponse(400, { code, message: 'rejected' }));

    const result = await verifySlipWithSlipOk(CREDENTIALS, { slipData: 'base64', expectedAmount: 100, expectedReceiver: PROMPTPAY });

    expect(result).toMatchObject({ matched: false, transactionRef: null, raw: { code } });
  });

  it.each([1001, 1003, 1004, 1009, 1010])('sends SlipOK code %i to manual review', async code => {
    global.fetch = vi.fn().mockResolvedValueOnce(mockResponse(400, { code, message: 'later' }));

    await expect(
      verifySlipWithSlipOk(CREDENTIALS, { slipData: 'base64', expectedAmount: 100, expectedReceiver: PROMPTPAY }),
    ).rejects.toMatchObject({ code: 'API_ERROR' });
  });

  it('does not match a slip with no transaction reference', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(mockResponse(200, { success: true, data: { amount: 100 } }));

    const result = await verifySlipWithSlipOk(CREDENTIALS, { slipData: 'base64', expectedAmount: 100, expectedReceiver: PROMPTPAY });

    expect(result.matched).toBe(false);
  });

  it('returns matched=true when SlipOK confirms payment with correct amount', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      mockResponse(200, { success: true, data: { amount: 3500, transRef: 'TX-001', receiver: RECEIVER } }),
    );

    const result = await verifySlipWithSlipOk(CREDENTIALS, {
      slipData: 'base64slipdata',
      expectedAmount: 3500, expectedReceiver: PROMPTPAY,
    });

    expect(result.matched).toBe(true);
    expect(result.transactionRef).toBe('TX-001');
    expect(result.amount).toBe(3500);
  });

  it('returns matched=false when amount does not match', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      mockResponse(200, { success: true, data: { amount: 1000, transRef: 'TX-002', receiver: RECEIVER } }),
    );

    const result = await verifySlipWithSlipOk(CREDENTIALS, {
      slipData: 'base64slipdata',
      expectedAmount: 3500, expectedReceiver: PROMPTPAY,
    });

    expect(result.matched).toBe(false);
  });

  it('allows ±0.01 THB tolerance for rounding', async () => {
    // Use 3500.005 → diff = 0.005 which is safely < 0.01 tolerance (no float precision issue)
    global.fetch = vi.fn().mockResolvedValueOnce(
      mockResponse(200, { success: true, data: { amount: 3500.005, transRef: 'TX-003', receiver: RECEIVER } }),
    );

    const result = await verifySlipWithSlipOk(CREDENTIALS, {
      slipData: 'base64',
      expectedAmount: 3500, expectedReceiver: PROMPTPAY,
    });

    // |3500.005 - 3500| = 0.005 <= 0.01 → matched
    expect(result.matched).toBe(true);
  });


  it('throws SlipOkError with INVALID_KEY on 401', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse(401, { error: 'Unauthorized' }),
    );

    await expect(
      verifySlipWithSlipOk(CREDENTIALS, { slipData: 'base64', expectedAmount: 100, expectedReceiver: PROMPTPAY }),
    ).rejects.toMatchObject({ code: 'INVALID_KEY' });
  });

  it('throws SlipOkError with API_ERROR on non-401 HTTP error', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      mockResponse(500, {}),
    );

    await expect(
      verifySlipWithSlipOk(CREDENTIALS, { slipData: 'base64', expectedAmount: 100, expectedReceiver: PROMPTPAY }),
    ).rejects.toMatchObject({ code: 'API_ERROR' });
  });

  it('throws SlipOkError with API_ERROR on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

    await expect(
      verifySlipWithSlipOk(CREDENTIALS, { slipData: 'base64', expectedAmount: 100, expectedReceiver: PROMPTPAY }),
    ).rejects.toMatchObject({ code: 'API_ERROR' });
  });

  it('returns matched=false when success is false even if amount matches', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      mockResponse(200, { success: false, data: { amount: 3500, transRef: 'TX-FAIL', receiver: RECEIVER } }),
    );

    const result = await verifySlipWithSlipOk(CREDENTIALS, {
      slipData: 'base64',
      expectedAmount: 3500, expectedReceiver: PROMPTPAY,
    });

    expect(result.matched).toBe(false);
  });
});

describe('verifySlipWithSlipOk receiver check', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  const respond = (receiver: unknown) => {
    global.fetch = vi.fn().mockResolvedValueOnce(mockResponse(200, { success: true, data: { amount: 100, transRef: 'TX-9', receiver } }));
    return verifySlipWithSlipOk(CREDENTIALS, { slipData: 'base64', expectedAmount: 100, expectedReceiver: PROMPTPAY });
  };

  it('rejects a slip paid to a different PromptPay number', async () => {
    const result = await respond({ proxy: { value: '081-xxx-9999' } });
    expect(result).toMatchObject({ matched: false, needsManualReview: false, receiverCheck: 'mismatch' });
  });

  it('sends a slip with no comparable receiver to manual review', async () => {
    const result = await respond({ displayName: 'Hotel', proxy: { value: 'xxx-xxx-xxxx' } });
    expect(result).toMatchObject({ matched: false, needsManualReview: true, receiverCheck: 'unknown' });
  });

  it('sends a slip with no receiver at all to manual review', async () => {
    const result = await respond(undefined);
    expect(result).toMatchObject({ matched: false, needsManualReview: true });
  });

  it('falls back to the bank account when the proxy has too few digits', async () => {
    const result = await respond({ proxy: { value: 'xxx-xxx-xx78' }, account: { value: '081-xxx-5678' } });
    expect(result).toMatchObject({ matched: true, receiverCheck: 'match' });
  });

  it('sends a slip with only a mismatching bank account to manual review', async () => {
    const result = await respond({ displayName: 'Hotel', account: { value: 'xxx-x-x1234-x' } });
    expect(result).toMatchObject({ matched: false, needsManualReview: true, receiverCheck: 'unknown' });
  });

  it('sends a slip whose proxy is masked and whose bank account differs to manual review', async () => {
    const result = await respond({ proxy: { value: 'xxx-xxx-xxxx' }, account: { value: '123-4-56789-0' } });
    expect(result).toMatchObject({ matched: false, needsManualReview: true, receiverCheck: 'unknown' });
  });

  it('does not check the receiver of a slip that already failed on amount', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(mockResponse(200, { success: true, data: { amount: 99, transRef: 'TX-9' } }));
    const result = await verifySlipWithSlipOk(CREDENTIALS, { slipData: 'base64', expectedAmount: 100, expectedReceiver: PROMPTPAY });
    expect(result).toMatchObject({ matched: false, needsManualReview: false, receiverCheck: null });
  });
});

describe('compareReceiverValue', () => {
  it.each([
    ['0812345678', '081-xxx-5678', 'match'],
    ['0812345678', 'XXX-XXX-5678', 'match'],
    ['0812345678', '+66 81 234 5678', 'match'],
    ['66812345678', '081-234-5678', 'match'],
    ['0812345678', '081-xxx-5679', 'mismatch'],
    ['1234567890123', 'x-xxxx-xxxx0-12-3', 'match'],
    ['1234567890123', 'x-xxxx-xxxx0-12-4', 'mismatch'],
  ] as const)('%s against %s is %s', (promptPay, slip, expected) => {
    expect(compareReceiverValue(promptPay, slip)).toBe(expected);
  });

  it('needs at least four compared digits', () => {
    expect(compareReceiverValue('0812345678', 'xxx-xxx-x678')).toBeNull();
    expect(compareReceiverValue('0812345678', 'xxx-xxx-5678')).toBe('match');
    expect(compareReceiverValue('0812345678', '')).toBeNull();
  });

  it('leaves a 13-digit ID that starts with 66 alone', () => {
    expect(compareReceiverValue('6612345678901', 'xxxxxxxxx8901')).toBe('match');
    expect(compareReceiverValue('6612345678901', '012345678901')).toBe('mismatch');
  });
});

describe('checkSlipReceiver', () => {
  it('decides on the proxy before the account', () => {
    expect(checkSlipReceiver(PROMPTPAY, { proxy: { value: '081-xxx-9999' }, account: { value: '081-xxx-5678' } })).toBe('mismatch');
  });

  it('treats a bank-account-only mismatch as unknown but still rejects a proxy mismatch', () => {
    expect(checkSlipReceiver(PROMPTPAY, { account: { value: '123-4-56789-0' } })).toBe('unknown');
    expect(checkSlipReceiver(PROMPTPAY, { account: { value: '081-xxx-5678' } })).toBe('match');
    expect(checkSlipReceiver(PROMPTPAY, { proxy: { value: '081-xxx-9999' }, account: { value: '123-4-56789-0' } })).toBe('mismatch');
  });

  it('is unknown when neither value can be compared', () => {
    expect(checkSlipReceiver(PROMPTPAY, { proxy: { value: 'xxx' }, account: {} })).toBe('unknown');
    expect(checkSlipReceiver(PROMPTPAY, null)).toBe('unknown');
  });
});

describe('getCentralSlipOkCredentials', () => {
  it('reads the central key and branch from SLIPOK_API_KEY and SLIPOK_BRANCH_ID', () => {
    expect(getCentralSlipOkCredentials({ SLIPOK_API_KEY: ' key ', SLIPOK_BRANCH_ID: '42' })).toEqual({ apiKey: 'key', branchId: '42' });
  });

  it('returns null when either secret is missing', () => {
    expect(getCentralSlipOkCredentials({ SLIPOK_API_KEY: 'key' })).toBeNull();
    expect(getCentralSlipOkCredentials({ SLIPOK_BRANCH_ID: '42' })).toBeNull();
    expect(getCentralSlipOkCredentials({ SLIPOK_API_KEY: ' ', SLIPOK_BRANCH_ID: '42' })).toBeNull();
  });

  it('ignores the old SLIP_OK_API variable', () => {
    expect(getCentralSlipOkCredentials({ SLIP_OK_API: 'https://example.test', SLIP_APIKEY: 'key' })).toBeNull();
  });
});

describe('local SlipOK mock URL', () => {
  it('accepts only loopback hosts', () => {
    expect(localSlipOkBaseUrl('http://127.0.0.1:8790/api/')).toBe('http://127.0.0.1:8790/api');
    expect(localSlipOkBaseUrl('http://localhost:8790')).toBe('http://localhost:8790');
    expect(localSlipOkBaseUrl('https://api.example.com')).toBeNull();
    expect(localSlipOkBaseUrl('http://127.0.0.1.evil.test')).toBeNull();
    expect(localSlipOkBaseUrl('file:///etc/passwd')).toBeNull();
    expect(localSlipOkBaseUrl('not a url')).toBeNull();
    expect(localSlipOkBaseUrl(undefined)).toBeNull();
  });

  it('ignores a non-loopback override and keeps the real SlipOK host', () => {
    expect(getCentralSlipOkCredentials({ SLIPOK_API_KEY: 'k', SLIPOK_BRANCH_ID: '1', SLIPOK_API_BASE_URL: 'https://attacker.test' })).toEqual({ apiKey: 'k', branchId: '1' });
  });

  it('sends the request to the loopback mock when set', async () => {
    const originalFetch = global.fetch;
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { amount: 100, transRef: 'T', receiver: { proxy: { value: '081-xxx-5678' } } } }), { status: 200 }));
    global.fetch = fetchMock;
    try {
      const credentials = getCentralSlipOkCredentials({ SLIPOK_API_KEY: 'k', SLIPOK_BRANCH_ID: '7', SLIPOK_API_BASE_URL: 'http://127.0.0.1:8790' })!;
      await verifySlipWithSlipOk(credentials, { slipData: 'b', expectedAmount: 100, expectedReceiver: '0812345678' });
      expect(fetchMock.mock.calls[0]![0]).toBe('http://127.0.0.1:8790/7');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
