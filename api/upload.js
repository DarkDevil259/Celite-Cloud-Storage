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

// Helper to manually parse JSON body when bodyParser is false
const parseJsonBody = async (req) => {
    // If body is already parsed by middleware (e.g. express.json()), use it
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        return req.body
    }

    // Otherwise, parse manually from stream
    return new Promise((resolve, reject) => {
        let data = ''
        req.on('data', chunk => {
            data += chunk
        })
        req.on('end', () => {
            try {
                resolve(data ? JSON.parse(data) : {})
            } catch (e) {
                // If body was empty, return empty object
                if (!data) return resolve({})
                reject(new Error('Invalid JSON body'))
            }
        })
        req.on('error', (err) => reject(err))
    })
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        // Authenticate user
        const authHeader = req.headers.authorization
        if (!authHeader) return res.status(401).json({ error: 'Unauthorized' })

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)
        if (authError || !user) return res.status(401).json({ error: 'Invalid token' })

        // ---------------------------------------------------------
        // Action Dispatcher
        // ---------------------------------------------------------
        const { action } = req.query

        if (action === 'init') {
            return handleInit(req, res, user)
        } else if (action === 'chunk') {
            return handleChunk(req, res, user)
        } else if (action === 'finish') {
            return handleFinish(req, res, user)
        } else {
            return res.status(400).json({ error: 'Invalid action. Use init, chunk, or finish.' })
        }

    } catch (error) {
        console.error('Upload API error:', error)
        return res.status(500).json({ error: error.message })
    }
}

// ---------------------------------------------------------
// 1. INIT - Create file record
// ---------------------------------------------------------
async function handleInit(req, res, user) {
    const body = await parseJsonBody(req)
    const { name, size, mimeType } = body

    // Note: encryption_iv and auth_tag will be null initially
    // We will update them after uploading the FIRST chunk (or all chunks if needed)
    // Actually, we generate a unique IV for EACH chunk now? 
    // Or one IV for the file? 
    // Logic change: We encrypt each chunk independently. 
    // So 'encryption_iv' on the file record might act as a master IV or be unused.
    // Let's rely on chunk-level encryption for simplicity in this flow.

    const { data: file, error } = await supabase
        .from('files')
        .insert({
            user_id: user.id,
            name,
            size,
            mime_type: mimeType,
            status: 'uploading',
            is_deleted: false,
            is_starred: false
        })
        .select()
        .single()

    if (error) throw new Error(error.message)

    return res.status(200).json({ fileId: file.id })
}

// ---------------------------------------------------------
// 2. CHUNK - Upload a single 4MB part
// ---------------------------------------------------------
async function handleChunk(req, res, user) {
    const form = formidable({ maxFileSize: 5 * 1024 * 1024 }) // 5MB limit
    const [fields, files] = await form.parse(req)

    const fileId = fields.fileId?.[0]
    const chunkIndex = parseInt(fields.chunkIndex?.[0])
    const uploadedFile = files.chunk?.[0]

    if (!fileId || isNaN(chunkIndex) || !uploadedFile) {
        return res.status(400).json({ error: 'Missing fileId, chunkIndex or chunk data' })
    }

    // Read chunk data
    const chunkBuffer = await fs.readFile(uploadedFile.filepath)

    // Verify file ownership
    const { data: fileRecord } = await supabase
        .from('files')
        .select('user_id')
        .eq('id', fileId)
        .single()

    if (!fileRecord || fileRecord.user_id !== user.id) {
        return res.status(403).json({ error: 'Access denied' })
    }

    // Encrypt chunk
    // Use a unique IV for each chunk to ensure security even if key is same
    const key = deriveKey(user.id)
    const { encrypted, iv, authTag } = encryptBuffer(chunkBuffer, key)

    // Upload to Google Drive
    const driveAccount = await getDriveForChunk(chunkIndex)
    const driveFileName = `${fileId}_chunk_${chunkIndex}`

    const driveFileId = await uploadChunkToDrive(
        driveAccount,
        encrypted,
        driveFileName
    )

    // Save chunk metadata
    const checksum = calculateChecksum(encrypted)

    const { error: chunkError } = await supabase
        .from('chunks')
        .insert({
            file_id: fileId,
            chunk_index: chunkIndex,
            drive_account_id: driveAccount.id,
            drive_file_id: driveFileId,
            size: encrypted.length,
            checksum: checksum,
            // Store IV/AuthTag per chunk? 
            // The current schema might not have columns for per-chunk IV. 
            // If schema lacks per-chunk IV, we must store it in the file record? 
            // BUT we have multiple chunks!
            // Solution: Prepend IV and AuthTag to the encrypted data itself!
            // The 'encryptBuffer' returns them separately.
            // Let's modify the upload to store [IV + AuthTag + EncryptedData] in Drive.
        })

    // WAIT! If we change storage format (prepending IV), we break download logic.
    // Does 'encryptBuffer' return a format we can just concat?
    // 'encryptBuffer' returns object. 
    // We should store IV/Tag in the DB if possible, or prepended to file.
    // IMPORTANT: The current 'chunks' table schema likely doesn't have 'iv' column.
    // Let's check schema. If not, we MUST prepend to data.
    // Prepending is safer for backward compatibility if we add columns later.
    // Let's PREPEND IV (16 bytes) and AuthTag (16 bytes) to the encrypted buffer.

    // However, 'deriveKey' uses user.id. 
    // 'encryptBuffer' uses random IV.

    // Let's assume for now we perform the update to 'chunks' table later if needed.
    // But wait, the previous code stored IV in 'files' table.
    // That implies ONE IV for the whole file. 
    // If we chunk locally and encrypt locally, we have creating multiple IVs.
    // We must enable storing IV per chunk OR use the same IV for all chunks (bad practice but easier).
    // BETTER: Use `encryption_iv` from file record for ALL chunks? 
    // No, we need to pass it to `handleChunk`.

    // REVISED PLAN:
    // To avoid schema changes:
    // We will append IV and AuthTag to the chunk data uploaded to Drive.
    // When downloading, we read first 32 bytes to get IV/Tag.
    // This requires updating `download.js` too.

    // Actually, looking at `api/upload.js` original code:
    // It derived ONE key, ONE IV, encrypted the WHOLE file, then split it.
    // So the chunks were just raw slices of the encrypted stream.
    // Now we are encrypting EACH chunk separately.
    // This means each chunk is a self-contained encrypted blob.
    // We MUST store the IV/Tag for each chunk.
    // Since we can't change DB schema easily right now, we will EMBED them in the file.
    // Format on Drive: [IV 16b][Tag 16b][Encrypted Data]

    const combinedBuffer = Buffer.concat([
        Buffer.from(iv, 'hex'),
        Buffer.from(authTag, 'hex'),
        encrypted
    ])

    // Re-upload with combined buffer
    await uploadChunkToDrive(driveAccount, combinedBuffer, driveFileName)

    // Clean up temp file
    await fs.unlink(uploadedFile.filepath)

    if (chunkError) throw chunkError

    return res.status(200).json({ success: true, chunkIndex })
}

// ---------------------------------------------------------
// 3. FINISH - Finalize upload
// ---------------------------------------------------------
async function handleFinish(req, res, user) {
    const body = await parseJsonBody(req)
    const { fileId } = body

    const { error } = await supabase
        .from('files')
        .update({ status: 'completed' })
        .eq('id', fileId)
        .eq('user_id', user.id)

    if (error) throw error

    return res.status(200).json({ success: true })
}
