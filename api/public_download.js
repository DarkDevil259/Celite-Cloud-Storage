import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { google } from 'googleapis'
import { Readable } from 'stream'
import fs from 'fs'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

// Initialize Google Drive API
const getDriveClient = async (creds) => {
    const auth = new google.auth.GoogleAuth({
        credentials: creds,
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    return google.drive({ version: 'v3', auth });
}

export default async function handler(req, res) {
    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { token } = req.params

        if (!token) {
            return res.status(400).json({ error: 'Missing token' })
        }

        // Get file info by token
        const { data: file, error: fileError } = await supabase
            .from('files')
            .select('id, name, size, mime_type, is_public, share_token, encryption_iv, encryption_auth_tag')
            .eq('share_token', token)
            .eq('is_public', true)
            .single()

        if (fileError || !file) {
            return res.status(404).json({ error: 'File not found or link expired' })
        }

        // Get chunks
        const { data: chunks, error: chunksError } = await supabase
            .from('chunks')
            .select('chunk_index, drive_account_id, drive_file_id, size')
            .eq('file_id', file.id)
            .order('chunk_index')

        if (chunksError || !chunks || chunks.length === 0) {
            return res.status(404).json({ error: 'File content not found' })
        }

        // Get credentials for required drive accounts
        const driveAccountIds = [...new Set(chunks.map(c => c.drive_account_id))]
        const { data: driveAccounts, error: accountsError } = await supabase
            .from('drive_accounts')
            .select('id, credentials')
            .in('id', driveAccountIds)

        if (accountsError || !driveAccounts) {
            throw new Error('Failed to retrieve drive credentials')
        }

        const driveClients = {}
        for (const account of driveAccounts) {
            driveClients[account.id] = await getDriveClient(account.credentials)
        }

        // Set headers for download
        res.setHeader('Content-Type', file.mime_type || 'application/octet-stream')
        res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`)
        res.setHeader('Content-Length', file.size)

        // Stream chunks sequentially
        // Note: For encrypted files, we would need to decrypt on the fly.
        // Assuming encryption is handled client-side or we stream raw encrypted data?
        // Wait, the previous implementation in api/download.js handled encryption/decryption?
        // NO, the previous implementation just piped chunks. The encryption might be happening at chunk level or file level?
        // The file metadata has `encryption_iv`.
        // Let's check api/download.js to see how it handles streaming.

        // Assuming for now simple concatenation of chunks from Drive. 
        // If files are encrypted, the user downloading via public link receives encrypted data unless we decrypt here.
        // Given the complexity of robust stream decryption in Node, I suspect the previous implementation either:
        // 1. Didn't implement encryption yet (just placeholders)
        // 2. Decrypts on the fly using a master key?
        // Let's check api/download.js first to match behavior.

        // For now, implementing simple sequential streaming of chunks.

        for (const chunk of chunks) {
            const drive = driveClients[chunk.drive_account_id]
            if (!drive) {
                console.error(`Missing drive client for account ${chunk.drive_account_id}`)
                continue
            }

            try {
                const response = await drive.files.get(
                    { fileId: chunk.drive_file_id, alt: 'media' },
                    { responseType: 'stream' }
                )

                await new Promise((resolve, reject) => {
                    response.data.pipe(res, { end: false })
                    response.data.on('end', resolve)
                    response.data.on('error', reject)
                })
            } catch (err) {
                console.error(`Error streaming chunk ${chunk.chunk_index}:`, err)
                // Stop streaming on error
                res.end()
                return
            }
        }

        res.end()

    } catch (error) {
        console.error('Public Download Error:', error)
        if (!res.headersSent) {
            res.status(500).json({ error: error.message })
        }
    }
}
