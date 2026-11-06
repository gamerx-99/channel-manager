ALTER TABLE `hotel_invoice_settings` ADD `vat_enabled` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `hotel_invoice_settings` ADD `vat_rate` real DEFAULT 7 NOT NULL;
--> statement-breakpoint
ALTER TABLE `hotel_invoice_settings` ADD `withholding_enabled` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `hotel_invoice_settings` ADD `withholding_rate` real DEFAULT 3 NOT NULL;
