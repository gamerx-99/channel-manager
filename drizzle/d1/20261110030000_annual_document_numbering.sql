PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_booking_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`hotel_id` text NOT NULL,
	`booking_id` text NOT NULL,
	`doc_type` text NOT NULL,
	`year` integer NOT NULL,
	`seq` integer NOT NULL,
	`doc_number` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`idempotency_key` text,
	`issued_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "booking_documents_doc_type_check" CHECK("__new_booking_documents"."doc_type" in ('invoice', 'receipt', 'tax_invoice')),
	CONSTRAINT "booking_documents_seq_check" CHECK("__new_booking_documents"."seq" > 0),
	CONSTRAINT "booking_documents_year_check" CHECK("__new_booking_documents"."year" >= 2020 and "__new_booking_documents"."year" <= 2100)
);
--> statement-breakpoint
INSERT INTO `__new_booking_documents`("id", "hotel_id", "booking_id", "doc_type", "year", "seq", "doc_number", "snapshot_json", "idempotency_key", "issued_by", "created_at")
SELECT "id", "hotel_id", "booking_id", "doc_type",
       COALESCE(CAST(strftime('%Y', datetime("created_at" / 1000, 'unixepoch', '+7 hours')) AS INTEGER), 2026),
       "seq", "doc_number", "snapshot_json", NULL, "issued_by", "created_at"
FROM `booking_documents`;
--> statement-breakpoint
DROP TABLE `booking_documents`;
--> statement-breakpoint
ALTER TABLE `__new_booking_documents` RENAME TO `booking_documents`;
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_documents_hotel_type_year_seq_key` ON `booking_documents` (`hotel_id`,`doc_type`,`year`,`seq`);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_documents_hotel_idempotency_key` ON `booking_documents` (`hotel_id`,`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `idx_booking_documents_booking_id` ON `booking_documents` (`booking_id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
