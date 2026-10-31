-- Add created_ip_hash to bookings for per-IP hold rate limiting (Stage 4, S4).
ALTER TABLE `bookings` ADD COLUMN `created_ip_hash` text;
CREATE INDEX `idx_bookings_hold_ip` ON `bookings` (`hotel_id`, `created_ip_hash`, `status`, `expires_at`);
