-- Migration 0088: Set default timezone to Indian Standard Time (IST - Asia/Kolkata)

-- Update system settings default timezone
UPDATE settings
SET value = '"Asia/Kolkata"'
WHERE key = 'system.timezone';

-- Update all existing sites, users, and drivers to Asia/Kolkata
UPDATE sites
SET timezone = 'Asia/Kolkata'
WHERE timezone = 'America/New_York' OR timezone IS NULL;

UPDATE users
SET timezone = 'Asia/Kolkata'
WHERE timezone = 'America/New_York' OR timezone IS NULL;

UPDATE drivers
SET timezone = 'Asia/Kolkata'
WHERE timezone = 'America/New_York' OR timezone IS NULL;

-- Alter column default constraints to Asia/Kolkata
ALTER TABLE sites ALTER COLUMN timezone SET DEFAULT 'Asia/Kolkata';
ALTER TABLE users ALTER COLUMN timezone SET DEFAULT 'Asia/Kolkata';
ALTER TABLE drivers ALTER COLUMN timezone SET DEFAULT 'Asia/Kolkata';
