CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`email` text,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "agents_status_check" CHECK("agents"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
ALTER TABLE `bookings` ADD `marketing_consent` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `bookings` ADD `marketing_consent_at` text;
--> statement-breakpoint
ALTER TABLE `hotels` ADD `acquisition_source` text DEFAULT 'direct' NOT NULL CONSTRAINT "hotels_acquisition_source_check" CHECK("acquisition_source" in ('direct', 'referral', 'agent'));
--> statement-breakpoint
ALTER TABLE `hotels` ADD `referred_by_hotel_id` text REFERENCES `hotels`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `hotels` ADD `agent_id` text REFERENCES `agents`(`id`) ON DELETE SET NULL;
