CREATE TABLE `staff_shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`hotel_user_id` text NOT NULL,
	`date` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`break_minutes` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`hotel_user_id`) REFERENCES `hotel_users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "staff_shifts_date_check" CHECK("staff_shifts"."date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "staff_shifts_start_time_check" CHECK("staff_shifts"."start_time" glob '[0-2][0-9]:[0-5][0-9]' and substr("staff_shifts"."start_time", 1, 2) < '24'),
	CONSTRAINT "staff_shifts_end_time_check" CHECK("staff_shifts"."end_time" glob '[0-2][0-9]:[0-5][0-9]' and substr("staff_shifts"."end_time", 1, 2) < '24'),
	CONSTRAINT "staff_shifts_break_check" CHECK("staff_shifts"."break_minutes" >= 0)
);
--> statement-breakpoint
CREATE INDEX `staff_shifts_hotel_date_idx` ON `staff_shifts` (`hotel_id`,`date`);--> statement-breakpoint
ALTER TABLE `hotel_users` ADD `full_name` text;--> statement-breakpoint
ALTER TABLE `hotel_users` ADD `position` text;