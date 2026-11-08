PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_booking_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`booking_id` text NOT NULL,
	`doc_type` text NOT NULL,
	`issued_year` integer NOT NULL,
	`seq` integer NOT NULL,
	`doc_number` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`issued_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "booking_documents_doc_type_check" CHECK("__new_booking_documents"."doc_type" in ('quotation', 'payment_receipt', 'receipt', 'tax_invoice')),
	CONSTRAINT "booking_documents_issued_year_check" CHECK("__new_booking_documents"."issued_year" between 2000 and 9999),
	CONSTRAINT "booking_documents_seq_check" CHECK("__new_booking_documents"."seq" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_booking_documents`("id", "hotel_id", "booking_id", "doc_type", "issued_year", "seq", "doc_number", "snapshot_json", "issued_by", "created_at") SELECT `id`, `hotel_id`, `booking_id`, `doc_type`, CAST(COALESCE(substr(json_extract(`snapshot_json`, '$.issuedOn'), 1, 4), strftime('%Y', `created_at` / 1000, 'unixepoch', '+7 hours')) AS INTEGER), `seq`, `doc_number`, `snapshot_json`, `issued_by`, `created_at` FROM `booking_documents`;--> statement-breakpoint
DROP TABLE `booking_documents`;--> statement-breakpoint
ALTER TABLE `__new_booking_documents` RENAME TO `booking_documents`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `booking_documents_hotel_type_year_seq_key` ON `booking_documents` (`hotel_id`,`doc_type`,`issued_year`,`seq`);--> statement-breakpoint
CREATE INDEX `idx_booking_documents_booking_id` ON `booking_documents` (`booking_id`);