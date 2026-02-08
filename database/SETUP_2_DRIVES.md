# Setting Up 2 Google Drive Accounts (Initial Configuration)

## Quick Start Guide

### Step 1: Create Google Drive Folders

For **each** of your 2 Google Drive accounts:

1. Log into the Google Drive account
2. Create a new folder:
   - Drive 1: "CeliteCloud-Storage-1"
   - Drive 2: "CeliteCloud-Storage-2"
3. Get the **Folder ID** from the URL:
   ```
   https://drive.google.com/drive/folders/FOLDER_ID_HERE
   ```
   Copy the `FOLDER_ID_HERE` part

### Step 2: Share Folders with Service Account

For each folder you created:

1. Right-click the folder → **Share**
2. Enter this email address:
   ```
   celitecloud-storage@celitecloud.iam.gserviceaccount.com
   ```
3. Grant **Editor** permissions (not Viewer!)
4. Click **Share**

### Step 3: Update the SQL File

1. Open `database/insert_2_drives.sql`
2. Replace the following values:

**For Drive 1:**
- Line 22: Replace `'your-drive-1-email@gmail.com'` with your actual Gmail
- Line 42: Replace `'YOUR_FOLDER_ID_HERE'` with the folder ID from Step 1

**For Drive 2:**
- Line 50: Replace `'your-drive-2-email@gmail.com'` with your actual Gmail  
- Line 70: Replace `'YOUR_FOLDER_ID_HERE'` with the folder ID from Step 1

### Step 4: Run Database Setup

1. Go to [Supabase SQL Editor](https://supabase.com/dashboard/project/hctzexynfdbnpezpoodr/sql)
2. First, run `database/schema.sql` to create the tables
3. Then, run `database/insert_2_drives.sql` to add your drive accounts
4. Verify with the query at the bottom of the file

### Step 5: Test Backend Connection

Run the backend server:
```bash
npm run dev:backend
```

Visit: http://localhost:3001/api/db-test

You should see your 2 configured drives!

---

## Adding More Drives Later (Optional)

When you're ready to add Drive 3 or Drive 4, use this SQL template:

```sql
INSERT INTO drive_accounts (
    drive_number,
    email,
    credentials,
    folder_id,
    is_active,
    is_trash_drive
) VALUES (
    3,  -- or 4 for trash drive
    'your-drive-3-email@gmail.com',
    '{...same credentials JSON from insert_2_drives.sql...}'::jsonb,
    'NEW_FOLDER_ID_HERE',
    true,
    false  -- set to true ONLY for drive 4 (trash drive)
);
```

---

## Information You'll Need

Please provide:

### Drive 1:
- Email address: `__________________`
- Folder ID: `__________________`

### Drive 2:
- Email address: `__________________`
- Folder ID: `__________________`
