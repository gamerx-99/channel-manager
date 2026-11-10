ALTER TABLE hotel_payment_settings ADD COLUMN booking_request_timeout_hours integer NOT NULL DEFAULT 24 CHECK (booking_request_timeout_hours BETWEEN 1 AND 168);--> statement-breakpoint
UPDATE bookings SET expires_at = created_at + 24 * 60 * 60 * 1000 WHERE status = 'pending_verification' AND expires_at IS NULL AND created_by IS NULL;--> statement-breakpoint
