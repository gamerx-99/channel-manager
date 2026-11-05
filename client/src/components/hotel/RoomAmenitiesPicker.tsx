import React from 'react';
import { ROOM_AMENITY_GROUPS, type RoomAmenityKey } from '@shared/roomAmenities';
import { useTranslation } from '@/lib/i18n';
import { Switch } from '@/components/ui/switch';
import './RoomAmenitiesPicker.css';

export interface RoomAmenitiesPickerProps {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  className?: string;
}

export function RoomAmenitiesPicker({
  value = [],
  onChange,
  disabled = false,
  className = '',
}: RoomAmenitiesPickerProps) {
  const { t } = useTranslation();
  const selectedSet = new Set(value);

  const handleToggle = (key: RoomAmenityKey, nextChecked: boolean) => {
    if (disabled) return;
    if (nextChecked) {
      if (!selectedSet.has(key)) {
        onChange([...value, key]);
      }
    } else {
      if (selectedSet.has(key)) {
        onChange(value.filter(item => item !== key));
      }
    }
  };

  return (
    <div className={`room-amenities-picker ${className}`.trim()}>
      <div className="room-amenities-header">
        <h4 className="room-amenities-title">{t('roomAmenities.pickerTitle')}</h4>
        <p className="room-amenities-description">{t('roomAmenities.pickerDescription')}</p>
      </div>

      <div className="room-amenities-groups">
        {ROOM_AMENITY_GROUPS.map(group => (
          <div key={group.key} className="room-amenities-group">
            <h5 className="room-amenities-group-title">
              {t(`roomAmenities.groups.${group.key}`)}
            </h5>
            <div className="room-amenities-grid">
              {group.items.map(itemKey => {
                const isChecked = selectedSet.has(itemKey);
                const switchId = `amenity-switch-${itemKey}`;
                return (
                  <label
                    key={itemKey}
                    htmlFor={switchId}
                    className={`room-amenity-row ${isChecked ? 'is-checked' : ''} ${disabled ? 'is-disabled' : ''}`.trim()}
                  >
                    <span className="room-amenity-name">
                      {t(`roomAmenities.items.${itemKey}`)}
                    </span>
                    <Switch
                      id={switchId}
                      checked={isChecked}
                      onCheckedChange={checked => handleToggle(itemKey, checked)}
                      disabled={disabled}
                      aria-checked={isChecked}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default RoomAmenitiesPicker;
