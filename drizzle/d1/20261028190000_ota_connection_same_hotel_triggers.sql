CREATE TRIGGER IF NOT EXISTS trg_ota_connection_room_same_hotel_insert
BEFORE INSERT ON ota_connections
WHEN NEW.room_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM rooms r WHERE r.id = NEW.room_id AND r.hotel_id = NEW.hotel_id
)
BEGIN
  SELECT RAISE(ABORT, 'The selected room does not belong to this hotel.');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS trg_ota_connection_room_same_hotel_update
BEFORE UPDATE OF room_id, hotel_id ON ota_connections
WHEN NEW.room_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM rooms r WHERE r.id = NEW.room_id AND r.hotel_id = NEW.hotel_id
)
BEGIN
  SELECT RAISE(ABORT, 'The selected room does not belong to this hotel.');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS trg_ota_connection_room_type_same_hotel_insert
BEFORE INSERT ON ota_connections
WHEN NEW.room_type_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM room_types rt WHERE rt.id = NEW.room_type_id AND rt.hotel_id = NEW.hotel_id
)
BEGIN
  SELECT RAISE(ABORT, 'The selected room type does not belong to this hotel.');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS trg_ota_connection_room_type_same_hotel_update
BEFORE UPDATE OF room_type_id, hotel_id ON ota_connections
WHEN NEW.room_type_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM room_types rt WHERE rt.id = NEW.room_type_id AND rt.hotel_id = NEW.hotel_id
)
BEGIN
  SELECT RAISE(ABORT, 'The selected room type does not belong to this hotel.');
END;
