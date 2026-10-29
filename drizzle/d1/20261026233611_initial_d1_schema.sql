CREATE TABLE `availability` (
	`id` text PRIMARY KEY NOT NULL,
	`room_type_id` text NOT NULL,
	`date` text NOT NULL,
	`price` numeric NOT NULL,
	`rooms_available` integer NOT NULL,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "availability_price_check" CHECK("availability"."price" >= 0),
	CONSTRAINT "availability_rooms_available_check" CHECK("availability"."rooms_available" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_room_type_date` ON `availability` (`room_type_id`,`date`);--> statement-breakpoint
CREATE INDEX `idx_availability_room_type_date` ON `availability` (`room_type_id`,`date`);--> statement-breakpoint
CREATE TABLE `booking_services` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`service_name` text NOT NULL,
	`pricing_model` text NOT NULL,
	`unit_price` numeric NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`total_price` numeric NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "booking_services_pricing_model_check" CHECK("booking_services"."pricing_model" in ('PER_PERSON_PER_NIGHT', 'PER_NIGHT', 'ONE_TIME')),
	CONSTRAINT "booking_services_unit_price_check" CHECK("booking_services"."unit_price" >= 0),
	CONSTRAINT "booking_services_quantity_check" CHECK("booking_services"."quantity" >= 1),
	CONSTRAINT "booking_services_total_price_check" CHECK("booking_services"."total_price" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_booking_services_booking_id` ON `booking_services` (`booking_id`);--> statement-breakpoint
CREATE TABLE `booking_status_log` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`changed_by` text,
	`reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_booking_status_log_booking_id` ON `booking_status_log` (`booking_id`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`room_id` text,
	`guest_name` text NOT NULL,
	`check_in` text NOT NULL,
	`check_out` text NOT NULL,
	`price` numeric NOT NULL,
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
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`ota_connection_id`) REFERENCES `ota_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "bookings_valid_dates_check" CHECK("bookings"."check_out" > "bookings"."check_in"),
	CONSTRAINT "bookings_price_check" CHECK("bookings"."price" >= 0),
	CONSTRAINT "bookings_source_check" CHECK("bookings"."source" in ('manual', 'walk-in', 'phone', 'ota_ical')),
	CONSTRAINT "bookings_status_check" CHECK("bookings"."status" in ('held', 'pending_payment', 'pending_verification', 'confirmed', 'expired', 'payment_rejected', 'cancelled', 'refund_pending', 'refunded', 'checked_in', 'checked_out')),
	CONSTRAINT "bookings_payment_status_check" CHECK("bookings"."payment_status" in ('unpaid', 'pending', 'verified', 'failed')),
	CONSTRAINT "bookings_payment_method_check" CHECK("bookings"."payment_method" is null or "bookings"."payment_method" in ('cash', 'transfer', 'promptpay')),
	CONSTRAINT "bookings_ota_block_shape" CHECK(("bookings"."source" = 'ota_ical') = ("bookings"."ota_connection_id" is not null and "bookings"."external_uid" is not null))
);
--> statement-breakpoint
CREATE INDEX `idx_bookings_hotel_dates` ON `bookings` (`hotel_id`,`check_in`,`check_out`);--> statement-breakpoint
CREATE INDEX `idx_bookings_room_dates` ON `bookings` (`room_id`,`check_in`,`check_out`);--> statement-breakpoint
CREATE INDEX `idx_bookings_expires_at` ON `bookings` (`expires_at`) WHERE "bookings"."expires_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bookings_ota_external_uid` ON `bookings` (`ota_connection_id`,`external_uid`) WHERE "bookings"."ota_connection_id" is not null;--> statement-breakpoint
CREATE TABLE `guests` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`first_name` text NOT NULL,
	`middle_name` text,
	`last_name` text NOT NULL,
	`gender` text,
	`passport_no` text NOT NULL,
	`nationality_code` text NOT NULL,
	`birth_date` text NOT NULL,
	`phone_no` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "guests_gender_check" CHECK("guests"."gender" is null or "guests"."gender" in ('M', 'F')),
	CONSTRAINT "guests_nationality_code_check" CHECK(length("guests"."nationality_code") = 3 and "guests"."nationality_code" not glob '*[^A-Z]*')
);
--> statement-breakpoint
CREATE INDEX `idx_guests_booking_id` ON `guests` (`booking_id`);--> statement-breakpoint
CREATE TABLE `hotel_admin_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_email` text,
	`action` text NOT NULL,
	`previous_admin_membership_id` text NOT NULL,
	`previous_admin_user_id` text NOT NULL,
	`new_admin_membership_id` text NOT NULL,
	`new_admin_user_id` text NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "hotel_admin_audit_logs_action_check" CHECK("hotel_admin_audit_logs"."action" = 'hotel_admin_transfer')
);
--> statement-breakpoint
CREATE INDEX `hotel_admin_audit_logs_hotel_created_idx` ON `hotel_admin_audit_logs` (`hotel_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `hotel_domains` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`domain` text NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hotel_domains_domain_key` ON `hotel_domains` (`domain`);--> statement-breakpoint
CREATE INDEX `idx_hotel_domains_hotel_id` ON `hotel_domains` (`hotel_id`);--> statement-breakpoint
CREATE INDEX `idx_hotel_domains_verified` ON `hotel_domains` (`domain`) WHERE "hotel_domains"."verified" = 1;--> statement-breakpoint
CREATE TABLE `hotel_media` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`url` text NOT NULL,
	`caption` text,
	`is_hero` integer DEFAULT false NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_hotel_media_hotel_order` ON `hotel_media` (`hotel_id`,`display_order`);--> statement-breakpoint
CREATE TABLE `hotel_payment_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`slipok_key_enc` text,
	`slipok_key_hash` text,
	`slipok_enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`promptpay_id` text,
	`payment_timeout_minutes` integer DEFAULT 15 NOT NULL,
	`slipok_branch_id` text,
	`hold_timeout_minutes` integer DEFAULT 15 NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "hotel_payment_settings_payment_timeout_check" CHECK("hotel_payment_settings"."payment_timeout_minutes" between 5 and 60),
	CONSTRAINT "hotel_payment_settings_hold_timeout_check" CHECK("hotel_payment_settings"."hold_timeout_minutes" between 5 and 60)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hotel_payment_settings_hotel_id_unique` ON `hotel_payment_settings` (`hotel_id`);--> statement-breakpoint
CREATE TABLE `hotel_services` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`name` text NOT NULL,
	`pricing_model` text NOT NULL,
	`unit_price` numeric NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "hotel_services_pricing_model_check" CHECK("hotel_services"."pricing_model" in ('PER_PERSON_PER_NIGHT', 'PER_NIGHT', 'ONE_TIME')),
	CONSTRAINT "hotel_services_unit_price_check" CHECK("hotel_services"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_hotel_services_hotel_id` ON `hotel_services` (`hotel_id`);--> statement-breakpoint
CREATE TABLE `hotel_signup_links` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`token` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`used_by_user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hotel_signup_links_token_key` ON `hotel_signup_links` (`token`);--> statement-breakpoint
CREATE INDEX `hotel_signup_links_token_idx` ON `hotel_signup_links` (`token`);--> statement-breakpoint
CREATE INDEX `hotel_signup_links_hotel_idx` ON `hotel_signup_links` (`hotel_id`);--> statement-breakpoint
CREATE TABLE `hotel_site_config` (
	`hotel_id` text PRIMARY KEY NOT NULL,
	`hero_copy` text,
	`accent_color` text,
	`visible_sections` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "hotel_site_config_accent_color_check" CHECK("hotel_site_config"."accent_color" is null or (substr("hotel_site_config"."accent_color", 1, 1) = '#' and length("hotel_site_config"."accent_color") in (4, 7) and substr("hotel_site_config"."accent_color", 2) not glob '*[^A-Fa-f0-9]*'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_hotel_site_config_hotel_id` ON `hotel_site_config` (`hotel_id`);--> statement-breakpoint
CREATE INDEX `idx_hotel_site_config_updated_at` ON `hotel_site_config` (`updated_at`);--> statement-breakpoint
CREATE TABLE `hotel_users` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`permission_grants` text DEFAULT '[]' NOT NULL,
	`permission_revokes` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "hotel_users_role_check" CHECK("hotel_users"."role" in ('super_admin', 'admin', 'support', 'hotel_owner', 'revenue_manager', 'front_desk', 'housekeeping')),
	CONSTRAINT "hotel_users_permission_grants_json_array" CHECK(json_valid("hotel_users"."permission_grants") = 1 and json_type("hotel_users"."permission_grants") = 'array'),
	CONSTRAINT "hotel_users_permission_revokes_json_array" CHECK(json_valid("hotel_users"."permission_revokes") = 1 and json_type("hotel_users"."permission_revokes") = 'array')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_hotel_user_membership` ON `hotel_users` (`hotel_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_one_hotel_admin_per_hotel` ON `hotel_users` (`hotel_id`) WHERE "hotel_users"."role" = 'hotel_owner';--> statement-breakpoint
CREATE INDEX `idx_hotel_users_user_id` ON `hotel_users` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_hotel_users_hotel_id` ON `hotel_users` (`hotel_id`);--> statement-breakpoint
CREATE TABLE `hotels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`address` text NOT NULL,
	`owner_contact` text NOT NULL,
	`public_enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hotels_slug_key` ON `hotels` (`slug`);--> statement-breakpoint
CREATE TABLE `housekeeping_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`booking_id` text,
	`assigned_to` text,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "housekeeping_tasks_status_check" CHECK("housekeeping_tasks"."status" in ('pending', 'in_progress', 'done'))
);
--> statement-breakpoint
CREATE INDEX `idx_housekeeping_tasks_room_id` ON `housekeeping_tasks` (`room_id`);--> statement-breakpoint
CREATE INDEX `idx_housekeeping_tasks_due_date` ON `housekeeping_tasks` (`due_date`);--> statement-breakpoint
CREATE TABLE `message_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`booking_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_message_threads_hotel_id` ON `message_threads` (`hotel_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`sender_user_id` text,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `message_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_messages_thread_id` ON `messages` (`thread_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`type` text NOT NULL,
	`message` text NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_hotel_id_idx` ON `notifications` (`hotel_id`);--> statement-breakpoint
CREATE TABLE `ota_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`api_key` text,
	`hotel_code` text,
	`ical_import_url` text,
	`ical_export_url` text,
	`last_sync_at` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`room_id` text,
	`ical_export_token` text NOT NULL,
	`last_error` text,
	`room_type_id` text,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ota_connections_status_check" CHECK("ota_connections"."status" in ('active', 'connected', 'conflict', 'error', 'disconnected')),
	CONSTRAINT "ota_connections_single_target" CHECK(not ("ota_connections"."room_id" is not null and "ota_connections"."room_type_id" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_hotel_provider` ON `ota_connections` (`hotel_id`,`provider`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ota_connections_export_token` ON `ota_connections` (`ical_export_token`);--> statement-breakpoint
CREATE INDEX `idx_ota_connections_hotel_id` ON `ota_connections` (`hotel_id`);--> statement-breakpoint
CREATE TABLE `ota_sync_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`provider` text NOT NULL,
	`direction` text NOT NULL,
	`action` text NOT NULL,
	`status` text NOT NULL,
	`payload` text,
	`response` text,
	`error_message` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ota_sync_logs_direction_check" CHECK("ota_sync_logs"."direction" in ('inbound', 'outbound')),
	CONSTRAINT "ota_sync_logs_status_check" CHECK("ota_sync_logs"."status" in ('success', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `idx_ota_sync_logs_hotel_time` ON `ota_sync_logs` (`hotel_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `payment_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`hotel_id` text NOT NULL,
	`amount` numeric NOT NULL,
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
	CONSTRAINT "payment_sessions_amount_check" CHECK("payment_sessions"."amount" > 0),
	CONSTRAINT "payment_sessions_status_check" CHECK("payment_sessions"."status" in ('pending', 'paid', 'expired', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `idx_payment_sessions_booking_id` ON `payment_sessions` (`booking_id`);--> statement-breakpoint
CREATE INDEX `idx_payment_sessions_hotel_id` ON `payment_sessions` (`hotel_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payment_sessions_verified_ref_unique` ON `payment_sessions` (`verified_transaction_ref`) WHERE "payment_sessions"."verified_transaction_ref" is not null;--> statement-breakpoint
CREATE TABLE `rate_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`room_type_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`override_price` numeric NOT NULL,
	`min_stay_nights` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "rate_overrides_price_check" CHECK("rate_overrides"."override_price" >= 0),
	CONSTRAINT "rate_overrides_min_stay_check" CHECK("rate_overrides"."min_stay_nights" is null or "rate_overrides"."min_stay_nights" > 0),
	CONSTRAINT "valid_rate_override_dates" CHECK("rate_overrides"."end_date" >= "rate_overrides"."start_date")
);
--> statement-breakpoint
CREATE INDEX `idx_rate_overrides_room_type_id` ON `rate_overrides` (`room_type_id`);--> statement-breakpoint
CREATE INDEX `idx_rate_overrides_dates` ON `rate_overrides` (`room_type_id`,`start_date`,`end_date`);--> statement-breakpoint
CREATE TABLE `room_housekeeping_status` (
	`room_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'clean' NOT NULL,
	`updated_by` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "room_housekeeping_status_check" CHECK("room_housekeeping_status"."status" in ('clean', 'dirty', 'out_of_order'))
);
--> statement-breakpoint
CREATE TABLE `room_types` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`name` text NOT NULL,
	`capacity` integer NOT NULL,
	`base_price` numeric NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`base_occupancy` integer DEFAULT 2 NOT NULL,
	`max_occupancy` integer DEFAULT 2 NOT NULL,
	`occupancy_pricing` text DEFAULT '{}' NOT NULL,
	`child_rule` text DEFAULT 'age' NOT NULL,
	`child_rule_limit` numeric,
	`child_rates` text DEFAULT '{"infant":{"mode":"free","value":0},"age_groups":[],"height":{"mode":"free","value":0}}' NOT NULL,
	`children_count_toward_max` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "room_types_capacity_check" CHECK("room_types"."capacity" > 0),
	CONSTRAINT "room_types_base_price_check" CHECK("room_types"."base_price" >= 0),
	CONSTRAINT "room_types_occupancy_values_check" CHECK("room_types"."base_occupancy" >= 1 and "room_types"."max_occupancy" >= "room_types"."base_occupancy" and json_valid("room_types"."occupancy_pricing") = 1 and json_type("room_types"."occupancy_pricing") = 'object' and json_valid("room_types"."child_rates") = 1 and json_type("room_types"."child_rates") = 'object' and "room_types"."child_rule" in ('age', 'height') and ("room_types"."child_rule_limit" is null or "room_types"."child_rule_limit" >= 0))
);
--> statement-breakpoint
CREATE INDEX `idx_room_types_hotel_id` ON `room_types` (`hotel_id`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`room_type_id` text NOT NULL,
	`room_number` text NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "rooms_status_check" CHECK("rooms"."status" in ('available', 'occupied', 'maintenance'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_room_per_hotel` ON `rooms` (`hotel_id`,`room_number`);--> statement-breakpoint
CREATE INDEX `idx_rooms_hotel_id` ON `rooms` (`hotel_id`);--> statement-breakpoint
CREATE INDEX `idx_rooms_room_type_id` ON `rooms` (`room_type_id`);--> statement-breakpoint
CREATE TABLE `service_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'api_service' NOT NULL,
	`hotel_id` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "service_accounts_role_check" CHECK("service_accounts"."role" = 'api_service')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_accounts_name_key` ON `service_accounts` (`name`);--> statement-breakpoint
CREATE INDEX `idx_service_accounts_hotel_id` ON `service_accounts` (`hotel_id`);--> statement-breakpoint
CREATE TABLE `support_access_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`support_user_id` text NOT NULL,
	`granted_by` text NOT NULL,
	`mode` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "support_access_grants_mode_check" CHECK("support_access_grants"."mode" in ('view', 'edit')),
	CONSTRAINT "support_access_grants_expiry_check" CHECK("support_access_grants"."expires_at" > "support_access_grants"."created_at" and "support_access_grants"."expires_at" <= "support_access_grants"."created_at" + 604800000)
);
--> statement-breakpoint
CREATE INDEX `support_access_grants_hotel_idx` ON `support_access_grants` (`hotel_id`);--> statement-breakpoint
CREATE INDEX `support_access_grants_support_user_idx` ON `support_access_grants` (`support_user_id`);--> statement-breakpoint
CREATE INDEX `support_access_grants_expires_idx` ON `support_access_grants` (`expires_at`);--> statement-breakpoint
CREATE TABLE `support_access_log` (
	`id` text PRIMARY KEY NOT NULL,
	`grant_id` text NOT NULL,
	`hotel_id` text NOT NULL,
	`support_user_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`grant_id`) REFERENCES `support_access_grants`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `support_access_log_grant_idx` ON `support_access_log` (`grant_id`);--> statement-breakpoint
CREATE INDEX `support_access_log_hotel_created_idx` ON `support_access_log` (`hotel_id`,`created_at`);