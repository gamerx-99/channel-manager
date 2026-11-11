// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { TOUR_STEP_KEY, useGuidedTour } from './useGuidedTour';

afterEach(() => window.sessionStorage.removeItem(TOUR_STEP_KEY));

const threeSteps = [
  { target: 'hotel-settings', title: 'Hotel', body: '' },
  { target: 'room-settings', title: 'Rooms', body: '' },
  { target: 'finance-settings', title: 'Finance', body: '' },
];

describe('tour route transition', () => {
  it('resumes the finance step after the finance page remounts the tour', () => {
    window.sessionStorage.setItem(TOUR_STEP_KEY, 'finance');
    const { result } = renderHook(() => useGuidedTour(threeSteps, true, vi.fn()));
    expect(result.current.stepIndex).toBe(2);
    expect(result.current.step?.target).toBe('finance-settings');
  });

  it('starts at the first step when no step is remembered or the key is unknown', () => {
    expect(renderHook(() => useGuidedTour(threeSteps, true, vi.fn())).result.current.stepIndex).toBe(0);
    window.sessionStorage.setItem(TOUR_STEP_KEY, 'something-else');
    expect(renderHook(() => useGuidedTour(threeSteps, true, vi.fn())).result.current.stepIndex).toBe(0);
  });

  it('opens at the step the progress points to when nothing is remembered', () => {
    expect(renderHook(() => useGuidedTour(threeSteps, true, vi.fn(), 0)).result.current.stepIndex).toBe(0);
    expect(renderHook(() => useGuidedTour(threeSteps, true, vi.fn(), 1)).result.current.stepIndex).toBe(1);
    expect(renderHook(() => useGuidedTour(threeSteps, true, vi.fn(), 2)).result.current.stepIndex).toBe(2);
  });

  it('lets a remembered step win over the progress-based one', () => {
    window.sessionStorage.setItem(TOUR_STEP_KEY, 'finance');
    expect(renderHook(() => useGuidedTour(threeSteps, true, vi.fn(), 0)).result.current.stepIndex).toBe(2);
    window.sessionStorage.setItem(TOUR_STEP_KEY, 'rooms');
    expect(renderHook(() => useGuidedTour(threeSteps, true, vi.fn(), 2)).result.current.stepIndex).toBe(1);
  });

  it('does not jump to another step when the progress changes while the tour is running', () => {
    const { result, rerender } = renderHook(({ start }) => useGuidedTour(threeSteps, true, vi.fn(), start), { initialProps: { start: 0 } });
    expect(result.current.stepIndex).toBe(0);
    rerender({ start: 1 });
    expect(result.current.stepIndex).toBe(0);
  });

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
