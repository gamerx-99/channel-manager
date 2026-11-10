// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ refetch: vi.fn(), mutate: vi.fn() }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ channelManager: { hotel: { invalidate: vi.fn() }, hotels: { invalidate: vi.fn() } } }),
    channelManager: {
      exportHotelData: { useQuery: () => ({ refetch: mocks.refetch, isFetching: false }) },
      previewHotelImport: { useMutation: () => ({ mutate: mocks.mutate, isPending: false }) },
      applyHotelImport: { useMutation: () => ({ mutate: mocks.mutate, isPending: false }) },
    },
  },
}));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { HotelDataTransfer } from './HotelDataTransfer';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('HotelDataTransfer', () => {
  it('shows a visible error when the export query refetch resolves with an error', async () => {
    mocks.refetch.mockResolvedValueOnce({ data: undefined, error: { message: 'Export permission denied' } });
    render(<HotelDataTransfer hotelId="hotel-a" slug="hotel-a" />);
    fireEvent.click(screen.getByRole('button', { name: 'hotelDataTransfer.export' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Export permission denied'));
  });
});
