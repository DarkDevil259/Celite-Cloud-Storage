import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

/**
 * Derive encryption key from secret and user ID
 */
export function deriveKey(userId) {
    if (!process.env.ENCRYPTION_SECRET) {
        throw new Error('ENCRYPTION_SECRET not set')
    }

    return crypto.pbkdf2Sync(
        process.env.ENCRYPTION_SECRET,
        userId,
        100000,
        KEY_LENGTH,
        'sha512'
    )
}

/**
 * Encrypt a buffer
 * @returns {encrypted: Buffer, iv: string, authTag: string}
 */
export function encryptBuffer(buffer, key) {
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

    const encrypted = Buffer.concat([
        cipher.update(buffer),
        cipher.final()
    ])

    const authTag = cipher.getAuthTag()

    return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
    }
}

/**
 * Decrypt a buffer
 */
export function decryptBuffer(encryptedBuffer, key, ivHex, authTagHex) {
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    return Buffer.concat([
        decipher.update(encryptedBuffer),
        decipher.final()
    ])
}

/**
 * Calculate SHA256 checksum
 */
export function calculateChecksum(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex')
}
