import formidable from 'formidable'
import fs from 'fs/promises'
import { supabase } from '../lib/supabase.js'
import { deriveKey, encryptBuffer, calculateChecksum } from '../lib/crypto.js'
import { splitIntoChunks } from '../lib/chunker.js'
import { getDriveForChunk, uploadChunkToDrive } from '../lib/drive.js'

export const config = {
    api: {
        bodyParser: false
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
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

        // Parse multipart form data
        const form = formidable({ maxFileSize: 500 * 1024 * 1024 }) // 500MB limit
        const [fields, files] = await form.parse(req)

        const uploadedFile = files.file[0]
        if (!uploadedFile) {
            return res.status(400).json({ error: 'No file uploaded' })
        }

        // Read file buffer
        const fileBuffer = await fs.readFile(uploadedFile.filepath)

        // Encrypt the file
        const key = deriveKey(user.id)
        const { encrypted, iv, authTag } = encryptBuffer(fileBuffer, key)

        // Split into chunks
        const chunks = splitIntoChunks(encrypted)

        // STEP 1: Save file record to database FIRST with status 'uploading'
        const { data: fileRecord, error: fileError } = await supabase
            .from('files')
            .insert({
                user_id: user.id,
                name: uploadedFile.originalFilename,
                size: uploadedFile.size,
                mime_type: uploadedFile.mimetype,
                encryption_iv: iv,
                encryption_auth_tag: authTag,
                is_starred: false,
                is_deleted: false,
                status: 'uploading'
            })
            .select()
            .single()

        if (fileError) {
            throw new Error(`Failed to create file record: ${fileError.message}`)
        }

        try {
            // STEP 2: Upload ALL chunks to Drive
            const uploadedChunks = []
            for (const chunk of chunks) {
                const driveAccount = await getDriveForChunk(chunk.index)
                const chunkFileName = `${fileRecord.id}_chunk_${chunk.index}`

                const driveFileId = await uploadChunkToDrive(
                    driveAccount,
                    chunk.data,
                    chunkFileName
                )

                const checksum = calculateChecksum(chunk.data)

                uploadedChunks.push({
                    chunkIndex: chunk.index,
                    driveAccountId: driveAccount.id,
                    driveFileId: driveFileId,
                    size: chunk.data.length,
                    checksum: checksum
                })
            }

            // STEP 3: Save chunk records to database
            for (const chunk of uploadedChunks) {
                const { error: chunkError } = await supabase
                    .from('chunks')
                    .insert({
                        file_id: fileRecord.id,
                        chunk_index: chunk.chunkIndex,
                        drive_account_id: chunk.driveAccountId,
                        drive_file_id: chunk.driveFileId,
                        size: chunk.size,
                        checksum: chunk.checksum
                    })

                if (chunkError) {
                    throw new Error(`Failed to create chunk record: ${chunkError.message}`)
                }
            }

            // STEP 4: Update file status to 'completed' after successful upload
            const { error: updateError } = await supabase
                .from('files')
                .update({ status: 'completed' })
                .eq('id', fileRecord.id)

            if (updateError) {
                throw new Error(`Failed to update file status: ${updateError.message}`)
            }

            // Clean up temp file
            await fs.unlink(uploadedFile.filepath)

            return res.status(200).json({
                success: true,
                file: {
                    id: fileRecord.id,
                    name: fileRecord.name,
                    size: fileRecord.size,
                    chunks: uploadedChunks.length
                }
            })
        } catch (uploadError) {
            // Mark file as failed if upload fails
            await supabase
                .from('files')
                .update({ status: 'failed' })
                .eq('id', fileRecord.id)

            throw uploadError
        }

    } catch (error) {
        console.error('Upload error:', error)
        return res.status(500).json({ error: error.message })
    }
}
