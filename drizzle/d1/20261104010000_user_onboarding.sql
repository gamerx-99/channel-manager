CREATE TABLE `user_onboarding` (
	`user_id` text PRIMARY KEY NOT NULL,
	`tour_completed_at` integer,
	`tour_skipped_at` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
