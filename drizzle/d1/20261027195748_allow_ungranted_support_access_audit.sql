PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_support_access_log` (
	`id` text PRIMARY KEY NOT NULL,
	`grant_id` text,
	`hotel_id` text NOT NULL,
	`support_user_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`grant_id`) REFERENCES `support_access_grants`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_support_access_log`("id", "grant_id", "hotel_id", "support_user_id", "action", "created_at") SELECT "id", "grant_id", "hotel_id", "support_user_id", "action", "created_at" FROM `support_access_log`;--> statement-breakpoint
DROP TABLE `support_access_log`;--> statement-breakpoint
ALTER TABLE `__new_support_access_log` RENAME TO `support_access_log`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `support_access_log_grant_idx` ON `support_access_log` (`grant_id`);--> statement-breakpoint
CREATE INDEX `support_access_log_hotel_created_idx` ON `support_access_log` (`hotel_id`,`created_at`);