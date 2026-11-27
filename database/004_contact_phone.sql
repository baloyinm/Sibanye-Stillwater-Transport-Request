-- 004: optional mobile number per user, used only for SMS when NOTIFY=messages. E.164 format, e.g. +27000000000. Run after 003.
ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL;
