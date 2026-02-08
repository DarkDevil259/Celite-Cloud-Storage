const NUM_CHUNKS = 3 // Always split into exactly 3 chunks

/**
 * Split buffer into exactly 3 chunks
 */
export function splitIntoChunks(buffer) {
    const totalSize = buffer.length
    const chunkSize = Math.ceil(totalSize / NUM_CHUNKS)
    const chunks = []

    for (let i = 0; i < NUM_CHUNKS; i++) {
        const start = i * chunkSize
        const end = Math.min(start + chunkSize, totalSize)

        chunks.push({
            data: buffer.slice(start, end),
            index: i  // 0, 1, 2
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
