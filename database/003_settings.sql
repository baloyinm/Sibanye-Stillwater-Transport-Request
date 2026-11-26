-- 003: columns and statuses for the settings in src/settings.mjs (run after 002). Safe to run on demo-sized data.
-- the original check is part of the column definition, so redefining the column without it removes it
ALTER TABLE users MODIFY user_type VARCHAR(50) NOT NULL;
ALTER TABLE users ADD CONSTRAINT chk_users_type CHECK (user_type IN ('user','driver','admin','supervisor'));
ALTER TABLE rides DROP CONSTRAINT chk_rides_status;
ALTER TABLE rides ADD CONSTRAINT chk_rides_status CHECK (status IN ('pending','endorsed','approved','rejected','offered','assigned','in_progress','completed','cancelled'));
ALTER TABLE rides
    MODIFY pickup_latitude DOUBLE NULL,
    MODIFY pickup_longitude DOUBLE NULL,
    ADD COLUMN cost_centre VARCHAR(50) NULL,
    ADD COLUMN kind VARCHAR(10) NOT NULL DEFAULT 'people',
    ADD COLUMN items TEXT NULL;
-- In-app messages (NOTIFY=inapp). Nothing is ever sent by SMS or email from this table.
CREATE TABLE IF NOT EXISTS notices (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    ride_id VARCHAR(255) NULL,
    text VARCHAR(300) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP NULL,
    INDEX idx_notices_user (user_id, read_at),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
