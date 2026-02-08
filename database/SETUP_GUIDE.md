# Database Setup Guide for CeliteCloudX

## Current Status

🔴 **MCP Connection:** Not active (token needs to be updated in `.cursor/mcp.json`)  
📋 **Database Schema:** Ready to deploy from `database/schema.sql`  
🎯 **Next Step:** Create the database tables in Supabase

## Quick Setup Instructions

### Option 1: Using Supabase Dashboard (Recommended)

1. **Open Supabase SQL Editor**
   - Go to [Supabase Dashboard](https://supabase.com/dashboard)
   - Select your project: `hctzexynfdbnpezpoodr`
   - Click on **SQL Editor** in the left sidebar

2. **Run the Schema**
   - Click **New Query**
   - Copy the entire contents of [`database/schema.sql`](file:///E:/Projects/Celite%20Cloud%20Storage/database/schema.sql)
   - Paste into the SQL Editor
   - Click **Run** (or press Ctrl+Enter)

3. **Verify Creation**
   - Go to **Table Editor** in the left sidebar
   - You should see three tables:
     - `files` - Stores file metadata
     - `chunks` - Stores chunk information and Drive locations
     - `drive_accounts` - Stores Google Drive account credentials

### Option 2: Using MCP (After Token Setup)

Once you've added your real Personal Access Token to `.cursor/mcp.json`:
1. Restart Cursor IDE completely
2. Ask me: "Run the database schema setup using MCP tools"
3. I'll be able to execute the SQL directly via MCP

---

## Database Schema Overview

The schema creates three main tables:

### 📄 `files` Table
Stores metadata for each uploaded file:
- File name, size, MIME type
- Encryption IV and auth tag
- Star/delete status
- User ownership (linked to Supabase Auth)

### 🧩 `chunks` Table
Tracks each encrypted chunk of a file:
- Which file it belongs to
- Which Google Drive account stores it
- Chunk index for reassembly
- Checksum for integrity verification

### 💾 `drive_accounts` Table
Manages Google Drive storage accounts:
- Up to 4 drives (numbered 1-4)
- Drive 4 is designated for trash
- Stores OAuth credentials
- Tracks storage usage

### 🔒 Security Features

- **Row Level Security (RLS)** enabled on all tables
- Users can only access their own files and chunks
- Drive accounts are service-only (no direct user access)
- Foreign key constraints ensure data integrity

---

## After Database Creation

Once the tables are created, you'll need to:

1. **Set up Google Drive accounts** (see [SETUP.md](file:///E:/Projects/Celite%20Cloud%20Storage/SETUP.md#L40-L78))
2. **Insert drive account credentials** into the `drive_accounts` table
3. **Test the application** with a file upload

---

## Troubleshooting

### "extension uuid-ossp does not exist"
This extension is usually pre-installed in Supabase. If you get this error:
1. Go to **Database** → **Extensions** in Supabase Dashboard
2. Search for "uuid-ossp"
3. Enable it
4. Re-run the schema

### "relation already exists"
The tables are already created. To start fresh:
```sql
DROP TABLE IF EXISTS chunks CASCADE;
DROP TABLE IF EXISTS files CASCADE;
DROP TABLE IF EXISTS drive_accounts CASCADE;
```
Then run the schema again.

### Need to verify what's created?
```sql
-- List all tables
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public';

-- Check a specific table structure
\d files
```
