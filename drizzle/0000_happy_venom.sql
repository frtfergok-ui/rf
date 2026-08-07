CREATE TABLE `bookings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service` text NOT NULL,
	`booking_date` text NOT NULL,
	`booking_time` text NOT NULL,
	`customer_name` text NOT NULL,
	`phone` text NOT NULL,
	`car` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bookings_slot` ON `bookings` (`booking_date`,`booking_time`);