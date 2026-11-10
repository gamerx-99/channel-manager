// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { TOUR_STEP_KEY, useGuidedTour } from './useGuidedTour';

afterEach(() => window.sessionStorage.removeItem(TOUR_STEP_KEY));

describe('tour route transition', () => {
  it('resumes the rooms step after the profile route remounts the tour', () => {
    window.sessionStorage.setItem(TOUR_STEP_KEY, 'rooms');
    const { result } = renderHook(() => useGuidedTour([
      { target: 'hotel-settings', title: 'Hotel', body: '' },
      { target: 'room-settings', title: 'Rooms', body: '' },
    ], true, vi.fn()));
    expect(result.current.stepIndex).toBe(1);
    expect(result.current.step?.target).toBe('room-settings');
  });
});
