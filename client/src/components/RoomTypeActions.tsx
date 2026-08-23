import React from 'react';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type RoomTypeActionItem = {
  id: string;
  name: string;
};

type RoomTypeActionsProps<T extends RoomTypeActionItem> = {
  roomType: T;
  onEdit: (roomType: T) => void;
  onDelete: (roomType: T) => void;
};

export function RoomTypeActions<T extends RoomTypeActionItem>({ roomType, onEdit, onDelete }: RoomTypeActionsProps<T>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="icon-button room-type-actions"
          type="button"
          aria-label={`Actions for ${roomType.name}`}
          title={`Room type actions for ${roomType.name}`}
          data-testid={`room-type-actions-${roomType.id}`}
        >
          <MoreHorizontal size={17} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="menu-surface menu-surface--room-actions">
        <DropdownMenuItem onSelect={() => onEdit(roomType)}>
          <Pencil size={14} /> Edit room type
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onDelete(roomType)}>
          <Trash2 size={14} /> Delete room type
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default RoomTypeActions;
