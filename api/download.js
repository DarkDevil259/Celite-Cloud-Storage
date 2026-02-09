import { supabase } from '../lib/supabase.js'
import { deriveKey, decryptBuffer, calculateChecksum } from '../lib/crypto.js'
import { reassembleChunks } from '../lib/chunker.js'
import { downloadChunkFromDrive } from '../lib/drive.js'
import { sendJson } from '../lib/response.js'

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return sendJson(res, 405, { error: 'Method not allowed' })
    }

    try {
        const { fileId } = req.query

        // Get user from auth header
        const authHeader = req.headers.authorization
        if (!authHeader) {
            return sendJson(res, 401, { error: 'Unauthorized' })
        }

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)

        if (authError || !user) {
            return sendJson(res, 401, { error: 'Invalid token' })
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
            return sendJson(res, 404, { error: 'File not found' })
        }

        // Check if file upload is completed
        if (file.status && file.status !== 'completed') {
            return sendJson(res, 400, { error: `File is not ready for download (status: ${file.status})` })
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
            return sendJson(res, 404, { error: 'File chunks not found' })
        }

        // Prepare response for streaming
        res.setHeader('Content-Type', file.mime_type || 'application/octet-stream')
        res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`)
        // Content-Length using the original file size stored in DB
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
            // This matches the format used in api/upload.js
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
        console.error('Download error:', error)
        if (!res.headersSent) {
            return sendJson(res, 500, { error: error.message })
        }
        // If headers were already sent (streaming started), we can't switch to JSON.
        // We just end the response.
        res.end()
    }
}
