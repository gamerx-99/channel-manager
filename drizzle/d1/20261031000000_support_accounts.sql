-- Platform support accounts (spec 14). Support belongs to no hotel, so it cannot be a hotel_users row.
CREATE TABLE `support_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`invited_by` text NOT NULL,
	`accepted_at` integer,
	`disabled_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX `uq_support_accounts_user` ON `support_accounts` (`user_id`);
CREATE UNIQUE INDEX `uq_support_accounts_email` ON `support_accounts` (`email`);
