PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_room_types` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`name` text NOT NULL,
	`capacity` integer NOT NULL,
	`base_price` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`base_occupancy` integer DEFAULT 2 NOT NULL,
	`max_occupancy` integer DEFAULT 2 NOT NULL,
	`occupancy_pricing` text DEFAULT '{}' NOT NULL,
	`child_rule` text DEFAULT 'age' NOT NULL,
	`child_rule_limit` text,
	`child_rates` text DEFAULT '{"infant":{"mode":"free","value":0},"age_groups":[],"height":{"mode":"free","value":0}}' NOT NULL,
	`children_count_toward_max` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "room_types_capacity_check" CHECK("__new_room_types"."capacity" > 0),
	CONSTRAINT "room_types_base_price_check" CHECK(typeof("__new_room_types"."base_price") = 'text' and "__new_room_types"."base_price" <> ''
  and "__new_room_types"."base_price" not glob '*[^0-9.]*' and "__new_room_types"."base_price" not glob '*.*.*'
  and (instr("__new_room_types"."base_price", '.') = 0 or (instr("__new_room_types"."base_price", '.') > 1
    and length(substr("__new_room_types"."base_price", instr("__new_room_types"."base_price", '.') + 1)) between 1 and 2))
  and cast("__new_room_types"."base_price" as numeric) >= 0),
	CONSTRAINT "room_types_occupancy_values_check" CHECK("__new_room_types"."base_occupancy" >= 1 and "__new_room_types"."max_occupancy" >= "__new_room_types"."base_occupancy" and json_valid("__new_room_types"."occupancy_pricing") = 1 and json_type("__new_room_types"."occupancy_pricing") = 'object' and "__new_room_types"."child_rule" in ('age', 'height') and ("__new_room_types"."child_rule_limit" is null or (typeof("__new_room_types"."child_rule_limit") = 'text' and "__new_room_types"."child_rule_limit" <> ''
  and "__new_room_types"."child_rule_limit" not glob '*[^0-9.]*' and "__new_room_types"."child_rule_limit" not glob '*.*.*'
  and (instr("__new_room_types"."child_rule_limit", '.') = 0 or instr("__new_room_types"."child_rule_limit", '.') > 1)
  and cast("__new_room_types"."child_rule_limit" as numeric) >= 0)))
);
--> statement-breakpoint
INSERT INTO `__new_room_types`("id", "hotel_id", "name", "capacity", "base_price", "created_at", "base_occupancy", "max_occupancy", "occupancy_pricing", "child_rule", "child_rule_limit", "child_rates", "children_count_toward_max") SELECT "id", "hotel_id", "name", "capacity", "base_price", "created_at", "base_occupancy", "max_occupancy", "occupancy_pricing", "child_rule", "child_rule_limit", "child_rates", "children_count_toward_max" FROM `room_types`;--> statement-breakpoint
DROP TABLE `room_types`;--> statement-breakpoint
ALTER TABLE `__new_room_types` RENAME TO `room_types`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_room_types_hotel_id` ON `room_types` (`hotel_id`);--> statement-breakpoint
PRAGMA foreign_key_check;
