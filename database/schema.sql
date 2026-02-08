-- CeliteCloudX Database Schema for Supabase

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drive accounts table (Must be created first - referenced by chunks)
CREATE TABLE drive_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    drive_number INT NOT NULL UNIQUE, -- 1, 2, 3, or 4
    email TEXT NOT NULL UNIQUE,
    credentials JSONB NOT NULL,
    folder_id TEXT,
    storage_used BIGINT DEFAULT 0,
    storage_limit BIGINT DEFAULT 15000000000, -- 15GB default
    is_active BOOLEAN DEFAULT true,
    is_trash_drive BOOLEAN DEFAULT false, -- TRUE only for Drive 4
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (drive_number BETWEEN 1 AND 4),
    CHECK (is_trash_drive = false OR drive_number = 4) -- Only Drive 4 can be trash drive
);

-- Files table
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    size BIGINT NOT NULL,
    mime_type TEXT,
    is_starred BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    encryption_iv TEXT NOT NULL,
    encryption_auth_tag TEXT NOT NULL
);

-- Chunks table (Depends on both files and drive_accounts)
CREATE TABLE chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    drive_account_id UUID NOT NULL REFERENCES drive_accounts(id),
    drive_file_id TEXT NOT NULL,
    size INT NOT NULL,
    checksum TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(file_id, chunk_index)
);

-- Indexes for performance
CREATE INDEX idx_files_user_id ON files(user_id);
CREATE INDEX idx_files_is_deleted ON files(is_deleted);
CREATE INDEX idx_files_is_starred ON files(is_starred);
CREATE INDEX idx_chunks_file_id ON chunks(file_id);
CREATE INDEX idx_chunks_drive_account ON chunks(drive_account_id);

-- Row Level Security (RLS) Policies
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE drive_accounts ENABLE ROW LEVEL SECURITY;

-- Users can only access their own files
CREATE POLICY "Users can view own files" ON files
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own files" ON files
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own files" ON files
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own files" ON files
    FOR DELETE USING (auth.uid() = user_id);

-- Users can only access chunks of their own files
CREATE POLICY "Users can view own file chunks" ON chunks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM files 
            WHERE files.id = chunks.file_id 
            AND files.user_id = auth.uid()
        )
    );

-- Drive accounts are service-only (no user access)
CREATE POLICY "Service accounts only" ON drive_accounts
    FOR ALL USING (false);

-- Automatic cleanup: Delete chunks older than 30 days in trash
-- Run this as a pg_cron job or Supabase Edge Function
-- For now, this is a manual query to run periodically:
-- DELETE FROM files WHERE is_deleted = true AND deleted_at < NOW() - INTERVAL '30 days';
