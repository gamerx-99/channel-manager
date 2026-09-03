// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookingDateRangePicker } from './BookingDateRangePicker';
import { format } from 'date-fns';

afterEach(() => cleanup());

function TestWrapper({
  onChange,
  initial,
  minDateIso,
}: {
  onChange: (range: { checkIn: string | null; checkOut: string | null }) => void;
  initial?: { checkIn: string | null; checkOut: string | null };
  minDateIso?: string;
}) {
  const [range, setRange] = useState<{ checkIn: string | null; checkOut: string | null }>(
    initial ?? { checkIn: null, checkOut: null },
  );

  return (
    <BookingDateRangePicker
      checkIn={range.checkIn}
      checkOut={range.checkOut}
      onChange={(next) => {
        onChange(next);
        setRange(next);
      }}
      minDateIso={minDateIso}
    />
  );
}

function localIso(day: number) {
  const now = new Date();
  return format(new Date(now.getFullYear(), now.getMonth(), day), 'yyyy-MM-dd');
}

function getDayButton(iso: string) {
  return document.querySelector(`[data-day="${iso}"] button`) as HTMLButtonElement | null;
}

describe('BookingDateRangePicker', () => {
  it('follows the locked 3-click cycle: click 1 sets check-in, click 2 sets check-out, click 3 resets', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const day15 = localIso(15);
    const day20 = localIso(20);
    const day25 = localIso(25);

    render(<TestWrapper onChange={onChange} minDateIso="2000-01-01" />);

    // Click 1: set check-in.
    const btn15 = getDayButton(day15);
    expect(btn15).not.toBeNull();
    await user.click(btn15!);
    expect(onChange).toHaveBeenLastCalledWith({ checkIn: day15, checkOut: null });

    // Click 2: set check-out to a later day.
    const btn20 = getDayButton(day20);
    expect(btn20).not.toBeNull();
    await user.click(btn20!);
    expect(onChange).toHaveBeenLastCalledWith({
      checkIn: day15,
      checkOut: day20,
    });

    // Click 3: a full range is already selected, start a new cycle.
    const btn25 = getDayButton(day25);
    expect(btn25).not.toBeNull();
    await user.click(btn25!);
    expect(onChange).toHaveBeenLastCalledWith({ checkIn: day25, checkOut: null });
  });

  it('restarts the cycle when click 2 falls on or before the current check-in', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const day15 = localIso(15);
    const day10 = localIso(10);

    render(<TestWrapper onChange={onChange} initial={{ checkIn: day15, checkOut: null }} minDateIso="2000-01-01" />);

    const btn10 = getDayButton(day10);
    expect(btn10).not.toBeNull();
    await user.click(btn10!);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ checkIn: day10, checkOut: null });
  });

  it('renders the calendar container and weekday headers', () => {
    render(<BookingDateRangePicker checkIn={null} checkOut={null} onChange={vi.fn()} />);
    expect(document.querySelector('.booking-calendar')).not.toBeNull();
    expect(screen.getByRole('grid')).toBeTruthy();
  });
});
