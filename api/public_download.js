import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { google } from 'googleapis'
import { deriveKey, decryptBuffer } from '../lib/crypto.js'
import { downloadChunkFromDrive } from '../lib/drive.js'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { token } = req.query

        if (!token) {
            return res.status(400).json({ error: 'Missing token' })
        }

        // Get file info by token
        const { data: file, error: fileError } = await supabase
            .from('files')
            .select('id, user_id, name, size, mime_type, is_public, share_token')
            .eq('share_token', token)
            .eq('is_public', true)
            .single()

        if (fileError || !file) {
            return res.status(404).json({ error: 'File not found or link expired' })
        }

        // Get chunks
        const { data: chunks, error: chunksError } = await supabase
            .from('chunks')
            .select(`
                *,
                drive_account:drive_accounts(*)
            `)
            .eq('file_id', file.id)
            .order('chunk_index')

        if (chunksError || !chunks || chunks.length === 0) {
            return res.status(404).json({ error: 'File content not found' })
        }

        // Set headers for download
        res.setHeader('Content-Type', file.mime_type || 'application/octet-stream')
        res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`)
        res.setHeader('Content-Length', file.size)

        // Derive key from file owner's ID
        const key = deriveKey(file.user_id)

        // Stream chunks sequentially
        for (const chunk of chunks) {
            const chunkBuffer = await downloadChunkFromDrive(
                chunk.drive_account,
                chunk.drive_file_id
            )

            // Extract IV, AuthTag, and Encrypted Data
            // Format: [IV(16)][Tag(16)][Data]
            const iv = chunkBuffer.subarray(0, 16)
            const authTag = chunkBuffer.subarray(16, 32)
            const encryptedData = chunkBuffer.subarray(32)

            // Decrypt chunk
            const decryptedChunk = decryptBuffer(
                encryptedData,
                key,
                iv.toString('hex'),
                authTag.toString('hex')
            )

            // Write to response stream
            res.write(decryptedChunk)
        }

        res.end()

    } catch (error) {
        console.error('Public Download Error:', error)
        if (!res.headersSent) {
            res.status(500).json({ error: error.message })
        }
        res.end()
    }
}
