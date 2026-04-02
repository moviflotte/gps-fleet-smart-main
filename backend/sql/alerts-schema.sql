-- Alerts schema for PostgreSQL
-- Run this on the server to create missing tables

CREATE SCHEMA IF NOT EXISTS alerts;

CREATE TABLE IF NOT EXISTS alerts.alert_states (
  company     TEXT NOT NULL,
  alert_id    TEXT NOT NULL,
  status      TEXT DEFAULT 'new',
  type        TEXT DEFAULT 'success',
  taken_by    TEXT,
  taken_at    TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (company, alert_id)
);

CREATE TABLE IF NOT EXISTS alerts.alert_actions (
  company     TEXT NOT NULL,
  alert_id    TEXT NOT NULL,
  action_id   TEXT NOT NULL,
  label       TEXT,
  done        BOOLEAN DEFAULT false,
  position    INTEGER DEFAULT 0,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (company, alert_id, action_id)
);

CREATE TABLE IF NOT EXISTS alerts.alert_comments (
  company     TEXT NOT NULL,
  alert_id    TEXT NOT NULL,
  comment_id  TEXT NOT NULL,
  text        TEXT,
  author      TEXT,
  at_local    TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (company, alert_id, comment_id)
);
