CREATE TABLE `coupon_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`coupon_id` text NOT NULL,
	`hotel_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`payment_id`) REFERENCES `subscription_payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `coupon_redemptions_payment_idx` ON `coupon_redemptions` (`payment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `coupon_redemptions_coupon_hotel_unique` ON `coupon_redemptions` (`coupon_id`,`hotel_id`);--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`percent_off` integer NOT NULL,
	`discount_months` integer NOT NULL,
	`max_redemptions` integer,
	`expires_at` integer,
	`active` integer DEFAULT true NOT NULL,
	`note` text,
	`created_by_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "coupons_percent_off_check" CHECK("coupons"."percent_off" between 1 and 100),
	CONSTRAINT "coupons_discount_months_check" CHECK("coupons"."discount_months" > 0),
	CONSTRAINT "coupons_max_redemptions_check" CHECK("coupons"."max_redemptions" is null or "coupons"."max_redemptions" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coupons_code_unique` ON `coupons` (`code`);--> statement-breakpoint
CREATE TABLE `hotel_subscriptions` (
	`hotel_id` text PRIMARY KEY NOT NULL,
	`paid_until` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `subscription_admin_log` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`admin_user_id` text NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `subscription_admin_log_hotel_created_idx` ON `subscription_admin_log` (`hotel_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `subscription_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`months` integer NOT NULL,
	`list_amount` text NOT NULL,
	`discount_amount` text NOT NULL,
	`amount` text NOT NULL,
	`coupon_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`slip_trans_ref` text,
	`qr_expires_at` integer,
	`created_by_user_id` text NOT NULL,
	`verified_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "subscription_payments_months_check" CHECK("subscription_payments"."months" > 0),
	CONSTRAINT "subscription_payments_status_check" CHECK("subscription_payments"."status" in ('pending', 'verified', 'failed', 'expired')),
	CONSTRAINT "subscription_payments_amounts_check" CHECK(typeof("subscription_payments"."list_amount") = 'text' and "subscription_payments"."list_amount" <> ''
  and "subscription_payments"."list_amount" not glob '*[^0-9.]*' and "subscription_payments"."list_amount" not glob '*.*.*'
  and (instr("subscription_payments"."list_amount", '.') = 0 or (instr("subscription_payments"."list_amount", '.') > 1
    and length(substr("subscription_payments"."list_amount", instr("subscription_payments"."list_amount", '.') + 1)) between 1 and 2))
  and cast("subscription_payments"."list_amount" as numeric) >= 0 and typeof("subscription_payments"."discount_amount") = 'text' and "subscription_payments"."discount_amount" <> ''
  and "subscription_payments"."discount_amount" not glob '*[^0-9.]*' and "subscription_payments"."discount_amount" not glob '*.*.*'
  and (instr("subscription_payments"."discount_amount", '.') = 0 or (instr("subscription_payments"."discount_amount", '.') > 1
    and length(substr("subscription_payments"."discount_amount", instr("subscription_payments"."discount_amount", '.') + 1)) between 1 and 2))
  and cast("subscription_payments"."discount_amount" as numeric) >= 0 and typeof("subscription_payments"."amount") = 'text' and "subscription_payments"."amount" <> ''
  and "subscription_payments"."amount" not glob '*[^0-9.]*' and "subscription_payments"."amount" not glob '*.*.*'
  and (instr("subscription_payments"."amount", '.') = 0 or (instr("subscription_payments"."amount", '.') > 1
    and length(substr("subscription_payments"."amount", instr("subscription_payments"."amount", '.') + 1)) between 1 and 2))
  and cast("subscription_payments"."amount" as numeric) >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_payments_slip_trans_ref_unique` ON `subscription_payments` (`slip_trans_ref`) WHERE "subscription_payments"."slip_trans_ref" is not null;--> statement-breakpoint
CREATE INDEX `subscription_payments_hotel_created_idx` ON `subscription_payments` (`hotel_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `hotels` ADD `province` text;