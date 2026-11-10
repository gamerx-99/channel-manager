CREATE TABLE `booking_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`booking_id` text NOT NULL,
	`doc_type` text NOT NULL,
	`seq` integer NOT NULL,
	`doc_number` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`issued_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "booking_documents_doc_type_check" CHECK("booking_documents"."doc_type" in ('receipt', 'tax_invoice')),
	CONSTRAINT "booking_documents_seq_check" CHECK("booking_documents"."seq" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_documents_hotel_type_seq_key` ON `booking_documents` (`hotel_id`,`doc_type`,`seq`);--> statement-breakpoint
CREATE INDEX `idx_booking_documents_booking_id` ON `booking_documents` (`booking_id`);--> statement-breakpoint
CREATE TABLE `hotel_invoice_settings` (
	`hotel_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`issuer_name` text NOT NULL,
	`address` text NOT NULL,
	`tax_id` text,
	`branch` text,
	`phone` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "hotel_invoice_settings_tax_id_check" CHECK("hotel_invoice_settings"."tax_id" is null or (length("hotel_invoice_settings"."tax_id") = 13 and "hotel_invoice_settings"."tax_id" not glob '*[^0-9]*'))
);
