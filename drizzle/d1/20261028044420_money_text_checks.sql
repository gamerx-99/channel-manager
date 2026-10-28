PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_availability` (
	`id` text PRIMARY KEY NOT NULL,
	`room_type_id` text NOT NULL,
	`date` text NOT NULL,
	`price` text NOT NULL,
	`rooms_available` integer NOT NULL,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "availability_price_check" CHECK(cast("__new_availability"."price" as numeric) >= 0),
	CONSTRAINT "availability_rooms_available_check" CHECK("__new_availability"."rooms_available" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_availability`("id", "room_type_id", "date", "price", "rooms_available") SELECT "id", "room_type_id", "date", "price", "rooms_available" FROM `availability`;--> statement-breakpoint
DROP TABLE `availability`;--> statement-breakpoint
ALTER TABLE `__new_availability` RENAME TO `availability`;--> statement-breakpoint
CREATE UNIQUE INDEX `unique_room_type_date` ON `availability` (`room_type_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_availability_room_type_date` ON `availability` (`room_type_id`,`date`);--> statement-breakpoint
CREATE TABLE `__new_booking_services` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`service_name` text NOT NULL,
	`pricing_model` text NOT NULL,
	`unit_price` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`total_price` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "booking_services_pricing_model_check" CHECK("__new_booking_services"."pricing_model" in ('PER_PERSON_PER_NIGHT', 'PER_NIGHT', 'ONE_TIME')),
	CONSTRAINT "booking_services_unit_price_check" CHECK(cast("__new_booking_services"."unit_price" as numeric) >= 0),
	CONSTRAINT "booking_services_quantity_check" CHECK("__new_booking_services"."quantity" >= 1),
	CONSTRAINT "booking_services_total_price_check" CHECK(cast("__new_booking_services"."total_price" as numeric) >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_booking_services`("id", "booking_id", "service_name", "pricing_model", "unit_price", "quantity", "total_price", "created_at") SELECT "id", "booking_id", "service_name", "pricing_model", "unit_price", "quantity", "total_price", "created_at" FROM `booking_services`;--> statement-breakpoint
DROP TABLE `booking_services`;--> statement-breakpoint
ALTER TABLE `__new_booking_services` RENAME TO `booking_services`;--> statement-breakpoint
CREATE INDEX `idx_booking_services_booking_id` ON `booking_services` (`booking_id`);--> statement-breakpoint
CREATE TABLE `__new_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`room_id` text,
	`guest_name` text NOT NULL,
	`check_in` text NOT NULL,
	`check_out` text NOT NULL,
	`price` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`ota_connection_id` text,
	`external_uid` text,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`expires_at` integer,
	`payment_method` text,
	`late_payment` integer DEFAULT false NOT NULL,
	`created_by` text,
	`adults_count` integer,
	`children_count` integer,
	`marketing_consent` integer DEFAULT false NOT NULL,
	`marketing_consent_at` text,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`ota_connection_id`) REFERENCES `ota_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "bookings_valid_dates_check" CHECK("__new_bookings"."check_out" > "__new_bookings"."check_in"),
	CONSTRAINT "bookings_price_check" CHECK(cast("__new_bookings"."price" as numeric) >= 0),
	CONSTRAINT "bookings_source_check" CHECK("__new_bookings"."source" in ('manual', 'walk-in', 'phone', 'ota_ical')),
	CONSTRAINT "bookings_status_check" CHECK("__new_bookings"."status" in ('held', 'pending_payment', 'pending_verification', 'confirmed', 'expired', 'payment_rejected', 'cancelled', 'refund_pending', 'refunded', 'checked_in', 'checked_out')),
	CONSTRAINT "bookings_payment_status_check" CHECK("__new_bookings"."payment_status" in ('unpaid', 'pending', 'verified', 'failed')),
	CONSTRAINT "bookings_payment_method_check" CHECK("__new_bookings"."payment_method" is null or "__new_bookings"."payment_method" in ('cash', 'transfer', 'promptpay')),
	CONSTRAINT "bookings_ota_block_shape" CHECK(("__new_bookings"."source" = 'ota_ical') = ("__new_bookings"."ota_connection_id" is not null and "__new_bookings"."external_uid" is not null))
);
--> statement-breakpoint
INSERT INTO `__new_bookings`("id", "hotel_id", "room_id", "guest_name", "check_in", "check_out", "price", "source", "status", "created_at", "ota_connection_id", "external_uid", "payment_status", "expires_at", "payment_method", "late_payment", "created_by", "adults_count", "children_count", "marketing_consent", "marketing_consent_at") SELECT "id", "hotel_id", "room_id", "guest_name", "check_in", "check_out", "price", "source", "status", "created_at", "ota_connection_id", "external_uid", "payment_status", "expires_at", "payment_method", "late_payment", "created_by", "adults_count", "children_count", "marketing_consent", "marketing_consent_at" FROM `bookings`;--> statement-breakpoint
DROP TABLE `bookings`;--> statement-breakpoint
ALTER TABLE `__new_bookings` RENAME TO `bookings`;--> statement-breakpoint
CREATE INDEX `idx_bookings_hotel_dates` ON `bookings` (`hotel_id`,`check_in`,`check_out`);--> statement-breakpoint
CREATE INDEX `idx_bookings_room_dates` ON `bookings` (`room_id`,`check_in`,`check_out`);--> statement-breakpoint
CREATE INDEX `idx_bookings_expires_at` ON `bookings` (`expires_at`) WHERE "bookings"."expires_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bookings_ota_external_uid` ON `bookings` (`ota_connection_id`,`external_uid`) WHERE "bookings"."ota_connection_id" is not null;--> statement-breakpoint
CREATE TABLE `__new_hotel_services` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`name` text NOT NULL,
	`pricing_model` text NOT NULL,
	`unit_price` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "hotel_services_pricing_model_check" CHECK("__new_hotel_services"."pricing_model" in ('PER_PERSON_PER_NIGHT', 'PER_NIGHT', 'ONE_TIME')),
	CONSTRAINT "hotel_services_unit_price_check" CHECK(cast("__new_hotel_services"."unit_price" as numeric) >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_hotel_services`("id", "hotel_id", "name", "pricing_model", "unit_price", "is_active", "created_at", "updated_at") SELECT "id", "hotel_id", "name", "pricing_model", "unit_price", "is_active", "created_at", "updated_at" FROM `hotel_services`;--> statement-breakpoint
DROP TABLE `hotel_services`;--> statement-breakpoint
ALTER TABLE `__new_hotel_services` RENAME TO `hotel_services`;--> statement-breakpoint
CREATE INDEX `idx_hotel_services_hotel_id` ON `hotel_services` (`hotel_id`);--> statement-breakpoint
CREATE TABLE `__new_payment_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`hotel_id` text NOT NULL,
	`amount` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`qr_reference` text NOT NULL,
	`qr_string` text,
	`expires_at` integer NOT NULL,
	`verified_at` integer,
	`slip_url` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`raw_response` text,
	`verified_transaction_ref` text,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "payment_sessions_amount_check" CHECK(cast("__new_payment_sessions"."amount" as numeric) > 0),
	CONSTRAINT "payment_sessions_status_check" CHECK("__new_payment_sessions"."status" in ('pending', 'paid', 'expired', 'failed'))
);
--> statement-breakpoint
INSERT INTO `__new_payment_sessions`("id", "booking_id", "hotel_id", "amount", "status", "qr_reference", "qr_string", "expires_at", "verified_at", "slip_url", "created_at", "updated_at", "raw_response", "verified_transaction_ref") SELECT "id", "booking_id", "hotel_id", "amount", "status", "qr_reference", "qr_string", "expires_at", "verified_at", "slip_url", "created_at", "updated_at", "raw_response", "verified_transaction_ref" FROM `payment_sessions`;--> statement-breakpoint
DROP TABLE `payment_sessions`;--> statement-breakpoint
ALTER TABLE `__new_payment_sessions` RENAME TO `payment_sessions`;--> statement-breakpoint
CREATE INDEX `idx_payment_sessions_booking_id` ON `payment_sessions` (`booking_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_sessions_hotel_id` ON `payment_sessions` (`hotel_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_sessions_verified_ref_unique` ON `payment_sessions` (`verified_transaction_ref`) WHERE "payment_sessions"."verified_transaction_ref" is not null;--> statement-breakpoint
CREATE TABLE `__new_rate_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`room_type_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`override_price` text NOT NULL,
	`min_stay_nights` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "rate_overrides_price_check" CHECK(cast("__new_rate_overrides"."override_price" as numeric) >= 0),
	CONSTRAINT "rate_overrides_min_stay_check" CHECK("__new_rate_overrides"."min_stay_nights" is null or "__new_rate_overrides"."min_stay_nights" > 0),
	CONSTRAINT "valid_rate_override_dates" CHECK("__new_rate_overrides"."end_date" >= "__new_rate_overrides"."start_date")
);
--> statement-breakpoint
INSERT INTO `__new_rate_overrides`("id", "room_type_id", "start_date", "end_date", "override_price", "min_stay_nights", "created_at") SELECT "id", "room_type_id", "start_date", "end_date", "override_price", "min_stay_nights", "created_at" FROM `rate_overrides`;--> statement-breakpoint
DROP TABLE `rate_overrides`;--> statement-breakpoint
ALTER TABLE `__new_rate_overrides` RENAME TO `rate_overrides`;--> statement-breakpoint
CREATE INDEX `idx_rate_overrides_room_type_id` ON `rate_overrides` (`room_type_id`);--> statement-breakpoint
CREATE INDEX `idx_rate_overrides_dates` ON `rate_overrides` (`room_type_id`,`start_date`,`end_date`);--> statement-breakpoint
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
	CONSTRAINT "room_types_base_price_check" CHECK(cast("__new_room_types"."base_price" as numeric) >= 0),
	CONSTRAINT "room_types_occupancy_values_check" CHECK("__new_room_types"."base_occupancy" >= 1 and "__new_room_types"."max_occupancy" >= "__new_room_types"."base_occupancy" and json_valid("__new_room_types"."occupancy_pricing") = 1 and json_type("__new_room_types"."occupancy_pricing") = 'object' and "__new_room_types"."child_rule" in ('age', 'height') and ("__new_room_types"."child_rule_limit" is null or cast("__new_room_types"."child_rule_limit" as numeric) >= 0))
);
--> statement-breakpoint
INSERT INTO `__new_room_types`("id", "hotel_id", "name", "capacity", "base_price", "created_at", "base_occupancy", "max_occupancy", "occupancy_pricing", "child_rule", "child_rule_limit", "child_rates", "children_count_toward_max") SELECT "id", "hotel_id", "name", "capacity", "base_price", "created_at", "base_occupancy", "max_occupancy", "occupancy_pricing", "child_rule", "child_rule_limit", "child_rates", "children_count_toward_max" FROM `room_types`;--> statement-breakpoint
DROP TABLE `room_types`;--> statement-breakpoint
ALTER TABLE `__new_room_types` RENAME TO `room_types`;--> statement-breakpoint
CREATE INDEX `idx_room_types_hotel_id` ON `room_types` (`hotel_id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_key_check;
