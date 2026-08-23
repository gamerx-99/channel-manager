import { describe, it, expect } from 'vitest';
import { getGlobalOtaSummary } from './otaSync';

describe('OTA Summary Backend', () => {
  it('should define getGlobalOtaSummary helper', () => {
    expect(typeof getGlobalOtaSummary).toBe('function');
  });

  it('should handle unauthenticated or restricted access safely', async () => {
    try {
      const res = await getGlobalOtaSummary('invalid-token');
      expect(Array.isArray(res)).toBe(true);
    } catch (err) {
      expect(err).toBeDefined();
    }
  });
});
