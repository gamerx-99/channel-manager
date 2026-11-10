ALTER TABLE `booking_documents` ADD COLUMN `payment_session_id` text REFERENCES `payment_sessions`(`id`) ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE `payment_sessions` ADD COLUMN `verified_by` text;--> statement-breakpoint
ALTER TABLE `payment_sessions` ADD COLUMN `verified_reason` text;--> statement-breakpoint
CREATE UNIQUE INDEX `booking_documents_one_receipt_per_booking` ON `booking_documents` (`booking_id`) WHERE `doc_type` = 'receipt';--> statement-breakpoint
CREATE UNIQUE INDEX `booking_documents_payment_session_unique` ON `booking_documents` (`payment_session_id`);--> statement-breakpoint
CREATE TRIGGER `booking_documents_verified_payment_guard` BEFORE INSERT ON `booking_documents`
WHEN NEW.doc_type = 'receipt' AND NEW.payment_session_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM payment_sessions s JOIN bookings b ON b.id = s.booking_id AND b.hotel_id = s.hotel_id
    WHERE s.id = NEW.payment_session_id AND s.hotel_id = NEW.hotel_id AND s.booking_id = NEW.booking_id
      AND s.status = 'paid' AND s.verified_transaction_ref IS NOT NULL
      AND (CASE WHEN instr(s.amount, '.') = 0 THEN CAST(s.amount AS INTEGER) * 100 ELSE CAST(substr(s.amount, 1, instr(s.amount, '.') - 1) AS INTEGER) * 100 + CAST(substr(substr(s.amount, instr(s.amount, '.') + 1) || '00', 1, 2) AS INTEGER) END)
        = (CASE WHEN instr(b.price, '.') = 0 THEN CAST(b.price AS INTEGER) * 100 ELSE CAST(substr(b.price, 1, instr(b.price, '.') - 1) AS INTEGER) * 100 + CAST(substr(substr(b.price, instr(b.price, '.') + 1) || '00', 1, 2) AS INTEGER) END)
  ) THEN RAISE(ABORT, 'receipt payment session is not verified for this booking') END;
END;--> statement-breakpoint
CREATE TRIGGER `payment_sessions_confirm_verified_full_booking` AFTER UPDATE OF `status`, `verified_transaction_ref` ON `payment_sessions`
WHEN NEW.status = 'paid' AND OLD.status = 'pending' AND NEW.verified_transaction_ref IS NOT NULL AND NEW.verified_by IS NOT NULL
BEGIN
  UPDATE bookings SET status = 'confirmed', payment_status = 'verified', expires_at = NULL
  WHERE id = NEW.booking_id AND hotel_id = NEW.hotel_id AND status = 'pending_verification'
    AND (CASE WHEN instr(NEW.amount, '.') = 0 THEN CAST(NEW.amount AS INTEGER) * 100 ELSE CAST(substr(NEW.amount, 1, instr(NEW.amount, '.') - 1) AS INTEGER) * 100 + CAST(substr(substr(NEW.amount, instr(NEW.amount, '.') + 1) || '00', 1, 2) AS INTEGER) END)
      = (SELECT CASE WHEN instr(price, '.') = 0 THEN CAST(price AS INTEGER) * 100 ELSE CAST(substr(price, 1, instr(price, '.') - 1) AS INTEGER) * 100 + CAST(substr(substr(price, instr(price, '.') + 1) || '00', 1, 2) AS INTEGER) END FROM bookings WHERE id = NEW.booking_id AND hotel_id = NEW.hotel_id);
  SELECT CASE WHEN changes() <> 1 THEN RAISE(ABORT, 'verified payment must match a pending full booking') END;
  INSERT INTO booking_status_log (id, booking_id, from_status, to_status, changed_by, reason, created_at)
  VALUES (lower(hex(randomblob(16))), NEW.booking_id, 'pending_verification', 'confirmed', NEW.verified_by,
    COALESCE(NEW.verified_reason, CASE WHEN NEW.verified_by = 'slipok' THEN 'slipok_auto_verified' ELSE 'manual_approve' END), NEW.verified_at);
END;--> statement-breakpoint
