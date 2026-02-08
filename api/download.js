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

        // Download and verify all chunks
        const downloadedChunks = []
        for (const chunk of chunks) {
            const chunkData = await downloadChunkFromDrive(
                chunk.drive_account,
                chunk.drive_file_id
            )

            // Verify checksum
            const checksum = calculateChecksum(chunkData)
            if (checksum !== chunk.checksum) {
                throw new Error(`Chunk ${chunk.chunk_index} checksum mismatch`)
            }

            downloadedChunks.push({
                index: chunk.chunk_index,
                data: chunkData
            })
        }

        // Reassemble chunks
        const encryptedFile = reassembleChunks(downloadedChunks)

        // Decrypt file
        const key = deriveKey(user.id)
        const decryptedFile = decryptBuffer(
            encryptedFile,
            key,
            file.encryption_iv,
            file.encryption_auth_tag
        )

        // Send file to user
        res.setHeader('Content-Type', file.mime_type || 'application/octet-stream')
        res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`)
        res.setHeader('Content-Length', decryptedFile.length)

        return res.status(200).send(decryptedFile)

    } catch (error) {
        console.error('Download error:', error)
        return res.status(500).json({ error: error.message })
    }
}
