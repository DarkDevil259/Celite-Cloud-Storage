import formidable from 'formidable'
import fs from 'fs/promises'
import { supabase } from '../lib/supabase.js'
import crypto from 'crypto'
import { deriveKey, encryptBuffer, calculateChecksum } from '../lib/crypto.js'
import { splitIntoChunks } from '../lib/chunker.js'
import { getDriveForChunk, uploadChunkToDrive } from '../lib/drive.js'
import { sendJson } from '../lib/response.js'

export const config = {
    api: {
        bodyParser: false
    }
}

// Helper to manually parse JSON body when bodyParser is false
const parseJsonBody = async (req) => {
    // If body is already parsed by Express middleware (express.json()), use it
    if (req.body && typeof req.body === 'object') {
        // Even if it's an empty object, return it - don't try to re-read the stream
        return req.body
    }

    // Otherwise, parse manually from stream (for Vercel serverless)
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
        return sendJson(res, 405, { error: 'Method not allowed' })
    }

    try {
        // Authenticate user
        const authHeader = req.headers.authorization
        if (!authHeader) return sendJson(res, 401, { error: 'Unauthorized' })

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)
        if (authError || !user) return sendJson(res, 401, { error: 'Invalid token' })

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
            return sendJson(res, 400, { error: 'Invalid action. Use init, chunk, or finish.' })
        }

    } catch (error) {
        console.error('Upload API error:', error)
        return sendJson(res, 500, { error: error.message })
    }
}

// ---------------------------------------------------------
// 1. INIT - Create file record
// ---------------------------------------------------------
async function handleInit(req, res, user) {
    console.log('Upload init started for user:', user.id)
    const body = await parseJsonBody(req)
    const { name, size, mimeType } = body

    // Generate dummy/master IV and AuthTag to satisfy DB constraints.
    // Since we encrypt per-chunk, these might not be used for decryption, 
    // but the DB requires them to be NOT NULL.
    const iv = crypto.randomBytes(16).toString('hex')
    const authTag = crypto.randomBytes(16).toString('hex') // Placeholder

    const { data: file, error } = await supabase
        .from('files')
        .insert({
            user_id: user.id,
            name,
            size,
            mime_type: mimeType,
            status: 'uploading',
            is_deleted: false,
            is_starred: false,
            encryption_iv: iv,
            encryption_auth_tag: authTag
        })
        .select()
        .single()

    if (error) {
        console.error('Failed to create file record:', error)
        throw new Error(error.message)
    }

    console.log('File record created with ID:', file.id)
    return sendJson(res, 200, { fileId: file.id })
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
        return sendJson(res, 400, { error: 'Missing fileId, chunkIndex or chunk data' })
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
        return sendJson(res, 403, { error: 'Access denied' })
    }

    // Encrypt chunk
    // Use a unique IV for each chunk to ensure security even if key is same
    const key = deriveKey(user.id)
    const { encrypted, iv, authTag } = encryptBuffer(chunkBuffer, key)

    // Combine: [IV 16][Tag 16][Encrypted]
    // This allows us to store the unique IV/Tag for this chunk WITH the chunk data
    const combinedBuffer = Buffer.concat([
        Buffer.from(iv, 'hex'),
        Buffer.from(authTag, 'hex'),
        encrypted
    ])

    // Upload to Google Drive (Single Upload)
    const driveAccount = await getDriveForChunk(chunkIndex)
    const driveFileName = `${fileId}_chunk_${chunkIndex}`

    const driveFileId = await uploadChunkToDrive(
        driveAccount,
        combinedBuffer,
        driveFileName
    )

    // Save chunk metadata
    const checksum = calculateChecksum(encrypted) // Checksum of the encrypted payload

    const { error: chunkError } = await supabase
        .from('chunks')
        .insert({
            file_id: fileId,
            chunk_index: chunkIndex,
            drive_account_id: driveAccount.id,
            drive_file_id: driveFileId,
            size: combinedBuffer.length, // Store size of the actual file on Drive
            checksum: checksum
        })

    // Clean up temp file
    await fs.unlink(uploadedFile.filepath)

    if (chunkError) throw chunkError

    return sendJson(res, 200, { success: true, chunkIndex })
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

    return sendJson(res, 200, { success: true })
}
