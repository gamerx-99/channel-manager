CREATE TABLE `booking_nights` (
	`room_id` text NOT NULL,
	`night` text NOT NULL,
	`booking_id` text NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_booking_nights_booking_id` ON `booking_nights` (`booking_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_booking_nights_room_night` ON `booking_nights` (`room_id`,`night`);
--> statement-breakpoint
WITH RECURSIVE occupied_nights (room_id, night, booking_id, check_out) AS (
  SELECT room_id, check_in, id, check_out
  FROM bookings
  WHERE room_id IS NOT NULL
    AND (
      status IN ('confirmed', 'checked_in')
      OR (status IN ('held', 'pending_payment', 'pending_verification')
        AND (expires_at IS NULL OR expires_at >= unixepoch('now') * 1000))
    )
  UNION ALL
  SELECT room_id, date(night, '+1 day'), booking_id, check_out
  FROM occupied_nights
  WHERE date(night, '+1 day') < check_out
)
INSERT INTO booking_nights (room_id, night, booking_id)
SELECT room_id, night, booking_id FROM occupied_nights;
