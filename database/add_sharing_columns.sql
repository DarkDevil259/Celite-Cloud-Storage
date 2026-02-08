-- Add sharing columns to files table
ALTER TABLE files 
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;

-- Create index on share_token for faster lookups
CREATE INDEX IF NOT EXISTS idx_files_share_token ON files(share_token);

-- Update RLS policies to allow public access to shared files
-- This policy allows anyone (even unauthenticated) to select files if is_public is true
CREATE POLICY "Public can view shared files" ON files
    FOR SELECT USING (is_public = true);
