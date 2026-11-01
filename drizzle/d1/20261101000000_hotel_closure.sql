-- Closing a hotel (spec 18). The request time drives every later step.
ALTER TABLE `hotels` ADD `closure_requested_at` integer;
ALTER TABLE `hotels` ADD `closure_was_public` integer;
CREATE INDEX `idx_hotels_closure_requested_at` ON `hotels` (`closure_requested_at`) WHERE `closure_requested_at` IS NOT NULL;
-- Proof that a closed hotel's data was deleted. It holds no name and no personal data.
CREATE TABLE `hotel_purge_log` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`closure_requested_at` integer NOT NULL,
	`purged_at` integer NOT NULL
);
