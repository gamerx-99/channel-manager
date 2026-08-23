// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RoomTypeActions, type RoomTypeActionItem } from './RoomTypeActions';

describe('RoomTypeActions', () => {
  it('opens Edit/Delete actions and remains clickable after room data changes', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const initialRoomType: RoomTypeActionItem = { id: 'room-1', name: 'QA Suite' };
    const updatedRoomType: RoomTypeActionItem = { id: 'room-2', name: 'QA Suite Updated' };
    const { rerender } = render(
      <RoomTypeActions roomType={initialRoomType} onEdit={onEdit} onDelete={onDelete} />,
    );

    const initialTrigger = screen.getByRole('button', { name: 'Actions for QA Suite' });
    expect(initialTrigger.getAttribute('aria-label')).toBe('Actions for QA Suite');
    await user.tab();
    expect(document.activeElement).toBe(initialTrigger);
    await user.keyboard('{Enter}');
    expect(initialTrigger.getAttribute('data-state')).toBe('open');
    expect(screen.getByRole('menuitem', { name: 'Edit room type' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Delete room type' })).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(initialTrigger.getAttribute('data-state')).toBe('closed');
    await user.click(initialTrigger);
    await user.click(screen.getByRole('menuitem', { name: 'Edit room type' }));
    expect(onEdit).toHaveBeenCalledWith(initialRoomType);

    rerender(
      <RoomTypeActions roomType={updatedRoomType} onEdit={onEdit} onDelete={onDelete} />,
    );
    await user.click(screen.getByTestId('room-type-actions-room-2'));
    await user.click(screen.getByRole('menuitem', { name: 'Delete room type' }));
    expect(onDelete).toHaveBeenCalledWith(updatedRoomType);
  });
});
