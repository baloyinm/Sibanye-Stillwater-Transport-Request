-- Sibanye-Stillwater Ride Sharing Schema for MariaDB

-- Users Table (Authentication)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    user_type VARCHAR(50) NOT NULL CHECK (user_type IN ('user', 'driver', 'admin')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Profiles Table (Passengers / Admins / Management)
CREATE TABLE IF NOT EXISTS profiles (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    surname VARCHAR(255),
    z_number VARCHAR(50) UNIQUE,
    mining_operation VARCHAR(255),
    specific_site VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE
);

-- Drivers Table
CREATE TABLE IF NOT EXISTS drivers (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    surname VARCHAR(255),
    z_number VARCHAR(50) UNIQUE,
    mining_operation VARCHAR(255),
    car_type VARCHAR(100),
    registration_number VARCHAR(50),
    is_available BOOLEAN DEFAULT FALSE,
    current_latitude DOUBLE,
    current_longitude DOUBLE,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE
);

-- Rides Table
CREATE TABLE IF NOT EXISTS rides (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    driver_id VARCHAR(255),
    pickup_latitude DOUBLE NOT NULL,
    pickup_longitude DOUBLE NOT NULL,
    pickup_address TEXT,
    destination_latitude DOUBLE,
    destination_longitude DOUBLE,
    destination_address TEXT,
    vehicle_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    distance_text VARCHAR(50),
    duration_text VARCHAR(50),
    scheduled_at TIMESTAMP NULL,
    scheduled_status VARCHAR(50) DEFAULT NULL,
    rejection_reason TEXT,
    passenger_count INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    cancelled_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES profiles(id),
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
);
