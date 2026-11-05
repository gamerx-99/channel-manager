ALTER TABLE `room_types` ADD `description` text;--> statement-breakpoint
ALTER TABLE `room_types` ADD `bed_type` text;--> statement-breakpoint
ALTER TABLE `room_types` ADD `size_sqm` integer;--> statement-breakpoint
ALTER TABLE `room_types` ADD `amenities` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
CREATE TRIGGER room_types_details_insert BEFORE INSERT ON room_types BEGIN
  SELECT CASE WHEN
  (NEW.description IS NOT NULL AND length(NEW.description) > 600)
  OR (NEW.bed_type IS NOT NULL AND length(NEW.bed_type) > 80)
  OR (NEW.size_sqm IS NOT NULL AND (typeof(NEW.size_sqm) <> 'integer' OR NEW.size_sqm NOT BETWEEN 1 AND 1000))
  OR json_valid(NEW.amenities) <> 1
  OR json_type(NEW.amenities) <> 'array'
  OR json_array_length(NEW.amenities) > 40
  OR EXISTS (SELECT 1 FROM json_each(NEW.amenities) WHERE type <> 'text' OR length(value) NOT BETWEEN 1 AND 40)
THEN RAISE(ABORT, 'Invalid room type details') END;
END;
--> statement-breakpoint
CREATE TRIGGER room_types_details_update BEFORE UPDATE ON room_types BEGIN
  SELECT CASE WHEN
  (NEW.description IS NOT NULL AND length(NEW.description) > 600)
  OR (NEW.bed_type IS NOT NULL AND length(NEW.bed_type) > 80)
  OR (NEW.size_sqm IS NOT NULL AND (typeof(NEW.size_sqm) <> 'integer' OR NEW.size_sqm NOT BETWEEN 1 AND 1000))
  OR json_valid(NEW.amenities) <> 1
  OR json_type(NEW.amenities) <> 'array'
  OR json_array_length(NEW.amenities) > 40
  OR EXISTS (SELECT 1 FROM json_each(NEW.amenities) WHERE type <> 'text' OR length(value) NOT BETWEEN 1 AND 40)
THEN RAISE(ABORT, 'Invalid room type details') END;
END;
