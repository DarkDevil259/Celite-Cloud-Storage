// Helper Script to Insert Drive Accounts into Supabase
// =====================================================
// This script reads drive-config.json and inserts the drive accounts into Supabase

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Error: Missing Supabase credentials in environment variables');
    console.error('Make sure SUPABASE_URL and SUPABASE_SERVICE_KEY are set in .env file');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function insertDriveAccounts() {
    try {
        // Read the configuration file
        const configPath = path.join(__dirname, 'drive-config.json');

        if (!fs.existsSync(configPath)) {
            console.error('❌ Error: drive-config.json not found');
            console.error('Please create database/drive-config.json with your drive configurations');
            console.error('See database/GOOGLE_DRIVE_SETUP.md for the format');
            process.exit(1);
        }

        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        if (!config.drives || !Array.isArray(config.drives)) {
            console.error('❌ Error: Invalid drive-config.json format');
            console.error('Expected: { "drives": [...] }');
            process.exit(1);
        }

        console.log('📁 Inserting drive accounts into Supabase...\n');

        for (const drive of config.drives) {
            const { driveNumber, email, folderId, credentials, isTrashDrive = false } = drive;

            // Validate required fields
            if (!driveNumber || !email || !folderId || !credentials) {
                console.error(`❌ Skipping drive ${driveNumber}: Missing required fields`);
                continue;
            }

            // Ensure Drive 4 is marked as trash drive
            const finalIsTrashDrive = driveNumber === 4 ? true : isTrashDrive;

            console.log(`📂 Inserting Drive ${driveNumber} (${email})...`);

            const { data, error } = await supabase
                .from('drive_accounts')
                .insert({
                    drive_number: driveNumber,
                    email: email,
                    credentials: credentials,
                    folder_id: folderId,
                    is_active: true,
                    is_trash_drive: finalIsTrashDrive
                })
                .select();

            if (error) {
                console.error(`   ❌ Error inserting Drive ${driveNumber}:`, error.message);
            } else {
                console.log(`   ✅ Successfully inserted Drive ${driveNumber}`);
            }
        }

        // Verify insertion
        console.log('\n📊 Verifying inserted drives...\n');
        const { data: drives, error: verifyError } = await supabase
            .from('drive_accounts')
            .select('drive_number, email, folder_id, is_active, is_trash_drive, created_at')
            .order('drive_number');

        if (verifyError) {
            console.error('❌ Error verifying drives:', verifyError.message);
        } else {
            console.table(drives);
            console.log(`\n✅ Total drives configured: ${drives.length}`);
        }

    } catch (error) {
        console.error('❌ Unexpected error:', error.message);
        process.exit(1);
    }
}

// Run the script
insertDriveAccounts();
