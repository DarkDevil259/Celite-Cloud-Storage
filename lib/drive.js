import { google } from 'googleapis'
import { Readable } from 'stream'
import { supabase } from './supabase.js'

/**
 * Get all active storage drives (excludes trash drive)
 * Used for distributing chunks across all available drives
 */
export async function getActiveStorageDrives() {
    const { data, error } = await supabase
        .from('drive_accounts')
        .select('*')
        .eq('is_active', true)
        .eq('is_trash_drive', false)
        .order('drive_number', { ascending: true })

    if (error || !data || data.length === 0) {
        throw new Error('No active storage drives available')
    }

    return data
}

/**
 * Get drive for a specific chunk index using round-robin across all available drives
 * This distributes chunks evenly across all active non-trash drives
 */
export async function getDriveForChunk(chunkIndex) {
    const drives = await getActiveStorageDrives()

    // Round-robin: distribute chunks across all available drives
    const driveIndex = chunkIndex % drives.length
    const selectedDrive = drives[driveIndex]

    console.log(`Chunk ${chunkIndex} -> Drive ${selectedDrive.drive_number} (${selectedDrive.email})`)

    return selectedDrive
}

/**
 * Get the dedicated trash drive (Drive 4)
 */
export async function getTrashDrive() {
    const { data, error } = await supabase
        .from('drive_accounts')
        .select('*')
        .eq('is_trash_drive', true)
        .eq('is_active', true)
        .single()

    if (error || !data) {
        throw new Error('Trash drive (Drive 4) not available')
    }

    return data
}

/**
 * Create authenticated Google Drive client
 * Supports both OAuth2 credentials and Service Account credentials
 */
export function createDriveClient(credentials) {
    let auth;

    // Check if this is a service account credential
    if (credentials.type === 'service_account' && credentials.private_key) {
        // Service Account authentication
        auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: credentials.client_email,
                private_key: credentials.private_key.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/drive']
        });
    } else {
        // OAuth2 authentication
        // credentials contains: client_id, client_secret, refresh_token, type
        const oauth2Client = new google.auth.OAuth2(
            credentials.client_id,
            credentials.client_secret
        );

        oauth2Client.setCredentials({
            refresh_token: credentials.refresh_token
        });

        auth = oauth2Client;
    }

    return google.drive({ version: 'v3', auth });
}

/**
 * Upload chunk to Google Drive
 */
export async function uploadChunkToDrive(driveAccount, chunkData, fileName) {
    const drive = createDriveClient(driveAccount.credentials)

    // Must specify parents array with folder_id
    const fileMetadata = {
        name: fileName,
        parents: driveAccount.folder_id ? [driveAccount.folder_id] : undefined
    }

    // Validate folder_id exists
    if (!driveAccount.folder_id) {
        throw new Error(`Drive account ${driveAccount.email} has no folder_id configured`)
    }

    const media = {
        mimeType: 'application/octet-stream',
        body: Readable.from(chunkData)
    }

    const response = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, size'
    })

    // Update storage usage
    await supabase
        .from('drive_accounts')
        .update({
            storage_used: driveAccount.storage_used + parseInt(response.data.size || 0)
        })
        .eq('id', driveAccount.id)

    return response.data.id
}

/**
 * Download chunk from Google Drive
 */
export async function downloadChunkFromDrive(driveAccount, driveFileId) {
    const drive = createDriveClient(driveAccount.credentials)

    const response = await drive.files.get(
        { fileId: driveFileId, alt: 'media' },
        { responseType: 'arraybuffer' }
    )

    return Buffer.from(response.data)
}

/**
 * Delete chunk from Google Drive
 */
export async function deleteChunkFromDrive(driveAccount, driveFileId) {
    const drive = createDriveClient(driveAccount.credentials)

    // Get file size before deletion
    const fileInfo = await drive.files.get({
        fileId: driveFileId,
        fields: 'size'
    })

    await drive.files.delete({ fileId: driveFileId })

    // Update storage usage
    await supabase
        .from('drive_accounts')
        .update({
            storage_used: Math.max(0, driveAccount.storage_used - parseInt(fileInfo.data.size || 0))
        })
        .eq('id', driveAccount.id)
}
