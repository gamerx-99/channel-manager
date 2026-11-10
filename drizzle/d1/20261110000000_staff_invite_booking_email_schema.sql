CREATE TABLE `booking_email_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_key` text NOT NULL,
	`status` text NOT NULL CHECK (`status` in ('sending', 'sent', 'failed')),
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`sent_at` integer
);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_email_events_event_key_unique` ON `booking_email_events` (`event_key`);--> statement-breakpoint
ALTER TABLE `bookings` ADD `guest_email` text;--> statement-breakpoint
ALTER TABLE `hotels` ADD `notification_email` text;--> statement-breakpoint
ALTER TABLE `verification` ADD `cancelled_at` integer;
