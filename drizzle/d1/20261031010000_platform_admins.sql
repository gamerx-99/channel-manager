-- Platform super admins (spec 14). A super admin belongs to no hotel, so it cannot be a hotel_users row.
CREATE TABLE `platform_admins` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`invited_by` text NOT NULL,
	`accepted_at` integer,
	`disabled_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX `uq_platform_admins_user` ON `platform_admins` (`user_id`);
CREATE UNIQUE INDEX `uq_platform_admins_email` ON `platform_admins` (`email`);
