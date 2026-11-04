ALTER TABLE `hotels` ADD `latitude` real;--> statement-breakpoint
ALTER TABLE `hotels` ADD `longitude` real;--> statement-breakpoint
ALTER TABLE `hotels` ADD `public_phone` text;--> statement-breakpoint
ALTER TABLE `hotels` ADD `show_public_phone` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `hotels` ADD `facebook_url` text;--> statement-breakpoint
ALTER TABLE `hotels` ADD `show_facebook` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `hotels` ADD `instagram_url` text;--> statement-breakpoint
ALTER TABLE `hotels` ADD `show_instagram` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `hotels` ADD `x_url` text;--> statement-breakpoint
ALTER TABLE `hotels` ADD `show_x` integer DEFAULT false NOT NULL;