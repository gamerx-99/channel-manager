CREATE TABLE `staff_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`assigned_to` text NOT NULL,
	`task_date` text NOT NULL,
	`title` text NOT NULL,
	`details` text,
	`room_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	`completed_by` text,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_to`) REFERENCES `hotel_users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "staff_tasks_date_check" CHECK("staff_tasks"."task_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "staff_tasks_title_check" CHECK(length(trim("staff_tasks"."title")) between 1 and 160),
	CONSTRAINT "staff_tasks_status_check" CHECK("staff_tasks"."status" in ('pending', 'done'))
);
--> statement-breakpoint
CREATE INDEX `staff_tasks_hotel_date_idx` ON `staff_tasks` (`hotel_id`,`task_date`);--> statement-breakpoint
CREATE INDEX `staff_tasks_assigned_date_idx` ON `staff_tasks` (`assigned_to`,`task_date`);--> statement-breakpoint
