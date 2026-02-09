// Default chunk size of 4MB to fit within Vercel's 4.5MB limit
export const CHUNK_SIZE = 4 * 1024 * 1024

/**
 * Calculate number of chunks for a given file size
 */
export function calculateChunks(fileSize) {
    if (fileSize === 0) return 1
    return Math.ceil(fileSize / CHUNK_SIZE)
}

/**
 * Split buffer into chunks (Server-side helper)
 * Note: Client-side should use File.slice() to avoid loading everything into memory
 */
export function splitIntoChunks(buffer) {
    const totalSize = buffer.length
    const numChunks = calculateChunks(totalSize)
    const chunks = []

    for (let i = 0; i < numChunks; i++) {
        const start = i * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, totalSize)

        chunks.push({
            data: buffer.slice(start, end),
            index: i
        })
    }

    return chunks
}

/**
 * Reassemble chunks into single buffer
 */
export function reassembleChunks(chunks) {
    // Sort by index to ensure correct order
    const sortedChunks = chunks.sort((a, b) => a.index - b.index)
    return Buffer.concat(sortedChunks.map(c => c.data))
}
