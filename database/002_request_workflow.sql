-- 002: what the request, approve, dispatch and track flow needs on top of schema.mariadb.sql (run it after that file).
-- Statuses used in rides.status: pending, approved, rejected, assigned, in_progress, completed, cancelled.
ALTER TABLE rides
    ADD COLUMN purpose VARCHAR(300) NULL AFTER passenger_count,
    ADD COLUMN approved_by VARCHAR(255) NULL AFTER rejection_reason,
    ADD COLUMN approved_at TIMESTAMP NULL AFTER approved_by,
    ADD CONSTRAINT fk_rides_approved_by FOREIGN KEY (approved_by) REFERENCES users(id),
    ADD CONSTRAINT chk_rides_status CHECK (status IN ('pending','approved','rejected','assigned','in_progress','completed','cancelled')),
    ADD INDEX idx_rides_status (status),
    ADD INDEX idx_rides_scheduled (scheduled_at);

ALTER TABLE drivers
    ADD COLUMN location_at TIMESTAMP NULL AFTER current_longitude;

-- Who did what and when on a trip (the history list and the audit trail). Never edited, only added to.
CREATE TABLE IF NOT EXISTS ride_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    ride_id VARCHAR(255) NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    type VARCHAR(30) NOT NULL,
    note VARCHAR(300) NULL,
    at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ride_events_ride (ride_id, at),
    FOREIGN KEY (ride_id) REFERENCES rides(id),
    FOREIGN KEY (actor_id) REFERENCES users(id)
);

-- Sign-in attempt limiting (from library data/php-session-auth-guard).
CREATE TABLE IF NOT EXISTS auth_rate_limits (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rl_key VARCHAR(190) NOT NULL,
    at_sec BIGINT NOT NULL,
    INDEX idx_rl (rl_key, at_sec)
);
