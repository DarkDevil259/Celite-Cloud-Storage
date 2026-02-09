import { supabase } from '../lib/supabase.js'
import { deriveKey, decryptBuffer, calculateChecksum } from '../lib/crypto.js'
import { reassembleChunks } from '../lib/chunker.js'
import { downloadChunkFromDrive } from '../lib/drive.js'

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { fileId } = req.query

        // Get user from auth header
        const authHeader = req.headers.authorization
        if (!authHeader) {
            return res.status(401).json({ error: 'Unauthorized' })
        }

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)

        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid token' })
        }

        // Get file metadata
        const { data: file, error: fileError } = await supabase
            .from('files')
            .select('*')
            .eq('id', fileId)
            .eq('user_id', user.id)
            .eq('is_deleted', false)
            .single()

        if (fileError || !file) {
            return res.status(404).json({ error: 'File not found' })
        }

        // Check if file upload is completed
        if (file.status && file.status !== 'completed') {
            return res.status(400).json({ error: `File is not ready for download (status: ${file.status})` })
        }

        // Get all chunks
        const { data: chunks, error: chunksError } = await supabase
            .from('chunks')
            .select(`
        *,
        drive_account:drive_accounts(*)
      `)
            .eq('file_id', fileId)
            .order('chunk_index', { ascending: true })

        if (chunksError || !chunks || chunks.length === 0) {
            return res.status(404).json({ error: 'File chunks not found' })
        }

        // Prepare response for streaming
        res.setHeader('Content-Type', file.mime_type || 'application/octet-stream')
        res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`)
        // Note: Content-Length is tricky if we strip IV/Tag. 
        // We stored 'size' in DB which is likely the Original Size? 
        // Or Encrypted Size? 
        // In upload.js: 'size: uploadedFile.size' (Original Size).
        // So we can use file.size.
        res.setHeader('Content-Length', file.size)

        const key = deriveKey(user.id)

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
                iv.toString('hex'), // decryptBuffer expects hex string? Checking lib/crypto.js... Yes.
                authTag.toString('hex')
            )

            // Write to response stream
            res.write(decryptedChunk)
        }

        res.end()

    } catch (error) {
        console.error('Download error:', error)
        if (!res.headersSent) {
            return res.status(500).json({ error: error.message })
        }
        // If headers were already sent (streaming started), we can't switch to JSON.
        // We just end the response.
        res.end()
    }
}
