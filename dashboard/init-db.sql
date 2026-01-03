-- CheapShot Dashboard Database Initialization
-- This script is run automatically when the PostgreSQL container first starts

-- Create session table for connect-pg-simple
CREATE TABLE IF NOT EXISTS "session" (
  "sid" VARCHAR NOT NULL COLLATE "default",
  "sess" JSON NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL,
  PRIMARY KEY ("sid")
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- Create table for storing guild settings/configuration
CREATE TABLE IF NOT EXISTS "guild_settings" (
  "guild_id" VARCHAR(20) NOT NULL,
  "settings" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY ("guild_id")
);

-- Create table for storing images/media (bytea for binary data)
CREATE TABLE IF NOT EXISTS "media" (
  "id" SERIAL PRIMARY KEY,
  "guild_id" VARCHAR(20),
  "user_id" VARCHAR(20),
  "filename" VARCHAR(255) NOT NULL,
  "content_type" VARCHAR(100) NOT NULL,
  "data" BYTEA NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "IDX_media_guild" ON "media" ("guild_id");
CREATE INDEX IF NOT EXISTS "IDX_media_user" ON "media" ("user_id");

-- Create table for audit logs
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" SERIAL PRIMARY KEY,
  "guild_id" VARCHAR(20) NOT NULL,
  "user_id" VARCHAR(20) NOT NULL,
  "action" VARCHAR(100) NOT NULL,
  "details" JSONB DEFAULT '{}',
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "IDX_audit_guild" ON "audit_logs" ("guild_id");
CREATE INDEX IF NOT EXISTS "IDX_audit_created" ON "audit_logs" ("created_at" DESC);

-- Create table for storing conversation context (per server, per channel, per user)
CREATE TABLE IF NOT EXISTS "conversation_context" (
  "guild_id" VARCHAR(20) NOT NULL,
  "channel_id" VARCHAR(20) NOT NULL,
  "user_id" VARCHAR(20) NOT NULL,
  "messages" JSONB NOT NULL DEFAULT '[]',
  "token_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY ("guild_id", "channel_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "IDX_context_guild" ON "conversation_context" ("guild_id");
CREATE INDEX IF NOT EXISTS "IDX_context_channel" ON "conversation_context" ("channel_id");
CREATE INDEX IF NOT EXISTS "IDX_context_user" ON "conversation_context" ("user_id");
CREATE INDEX IF NOT EXISTS "IDX_context_updated" ON "conversation_context" ("updated_at" DESC);
