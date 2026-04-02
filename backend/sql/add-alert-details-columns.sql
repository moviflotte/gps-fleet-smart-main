-- Migration: add title, vehicle, driver, location columns to alert_states
-- Safe to re-run (uses IF NOT EXISTS)

ALTER TABLE alerts.alert_states ADD COLUMN IF NOT EXISTS title    TEXT;
ALTER TABLE alerts.alert_states ADD COLUMN IF NOT EXISTS vehicle  TEXT;
ALTER TABLE alerts.alert_states ADD COLUMN IF NOT EXISTS driver   TEXT;
ALTER TABLE alerts.alert_states ADD COLUMN IF NOT EXISTS location TEXT;
