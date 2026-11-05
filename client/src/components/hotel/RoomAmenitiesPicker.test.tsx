// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoomAmenitiesPicker } from './RoomAmenitiesPicker';
import { ROOM_AMENITY_GROUPS, ROOM_AMENITY_KEYS } from '@shared/roomAmenities';

afterEach(() => {
  cleanup();
});

describe('RoomAmenitiesPicker', () => {
  it('renders picker header, all 5 groups, and all 30 amenity rows', () => {
    const handleChange = vi.fn();
    render(<RoomAmenitiesPicker value={[]} onChange={handleChange} />);

    // Picker title & description rendered
    expect(screen.getByText('Room amenities')).toBeDefined();
    expect(
      screen.getByText('Turn on amenities available in this room type. Guests will see them when choosing a room.')
    ).toBeDefined();

    // All 5 groups rendered
    expect(screen.getByText('Popular')).toBeDefined();
    expect(screen.getByText('In-room')).toBeDefined();
    expect(screen.getByText('Bathroom')).toBeDefined();
    expect(screen.getByText('Outdoor & other')).toBeDefined();
    expect(screen.getByText('Accessibility')).toBeDefined();

    // Exactly 30 switch inputs rendered
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(30);
    expect(ROOM_AMENITY_KEYS).toHaveLength(30);

    // Verify each switch is mapped with correct id and initial unchecked state
    for (const key of ROOM_AMENITY_KEYS) {
      const switchEl = document.getElementById(`amenity-switch-${key}`);
      expect(switchEl).not.toBeNull();
      expect(switchEl?.getAttribute('aria-checked')).toBe('false');
    }
  });

  it('reflects checked state for keys present in value prop', () => {
    render(
      <RoomAmenitiesPicker
        value={['air_conditioning', 'free_wifi', 'elevator']}
        onChange={vi.fn()}
      />
    );

    const acSwitch = document.getElementById('amenity-switch-air_conditioning');
    const wifiSwitch = document.getElementById('amenity-switch-free_wifi');
    const elevatorSwitch = document.getElementById('amenity-switch-elevator');
    const tvSwitch = document.getElementById('amenity-switch-tv');

    expect(acSwitch?.getAttribute('aria-checked')).toBe('true');
    expect(wifiSwitch?.getAttribute('aria-checked')).toBe('true');
    expect(elevatorSwitch?.getAttribute('aria-checked')).toBe('true');
    expect(tvSwitch?.getAttribute('aria-checked')).toBe('false');
  });

  it('toggles an unselected amenity ON when clicking its row/switch', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<RoomAmenitiesPicker value={['free_wifi']} onChange={handleChange} />);

    // Click row or label of 'fan'
    const fanLabel = screen.getByText('Fan');
    await user.click(fanLabel);

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(['free_wifi', 'fan']);
  });

  it('toggles an already selected amenity OFF when clicking its row/switch', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(
      <RoomAmenitiesPicker
        value={['free_wifi', 'air_conditioning']}
        onChange={handleChange}
      />
    );

    const wifiLabel = screen.getByText('Free Wi-Fi');
    await user.click(wifiLabel);

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(['air_conditioning']);
  });

  it('respects the disabled state: switches are disabled and clicking does not fire onChange', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<RoomAmenitiesPicker value={['free_wifi']} onChange={handleChange} disabled={true} />);

    const switches = screen.getAllByRole('switch');
    for (const switchEl of switches) {
      expect((switchEl as HTMLButtonElement).disabled).toBe(true);
    }

    const fanLabel = screen.getByText('Fan');
    await user.click(fanLabel);

    expect(handleChange).not.toHaveBeenCalled();
  });
});
