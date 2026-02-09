import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Get current session token
export const getAuthToken = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || null
}

// API base URL
const API_BASE = '/api'

// Upload file with progress tracking
export const uploadFile = (file, onProgress) => {
    let currentXhr = null
    let cancelled = false

    const promise = (async () => {
        const token = await getAuthToken()
        if (!token) throw new Error('Not authenticated')

        const CHUNK_SIZE = 4 * 1024 * 1024 // 4MB
        const totalSize = file.size
        const totalChunks = Math.ceil(totalSize / CHUNK_SIZE)

        // 1. INIT
        const initResponse = await fetch(`${API_BASE}/upload?action=init`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: file.name,
                size: file.size,
                mimeType: file.type
            })
        })

        if (!initResponse.ok) {
            const err = await initResponse.json()
            throw new Error(err.error || 'Upload initialization failed')
        }

        const { fileId } = await initResponse.json()
        let loadedGlobal = 0
        const startTime = Date.now()

        // 2. CHUNK LOOP
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            if (cancelled) throw new Error('Upload cancelled')

            const start = chunkIndex * CHUNK_SIZE
            const end = Math.min(start + CHUNK_SIZE, totalSize)
            const chunkBlob = file.slice(start, end)

            const formData = new FormData()
            formData.append('fileId', fileId)
            formData.append('chunkIndex', chunkIndex.toString())
            formData.append('chunk', chunkBlob, 'chunk.bin')

            await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest()
                currentXhr = xhr

                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable && onProgress) {
                        const chunkLoaded = event.loaded
                        const currentLoaded = loadedGlobal + chunkLoaded

                        const currentTime = Date.now()
                        const elapsedTime = (currentTime - startTime) / 1000
                        const avgSpeed = elapsedTime > 0 ? currentLoaded / elapsedTime : 0
                        const remaining = totalSize - currentLoaded
                        const timeRemaining = avgSpeed > 0 ? remaining / avgSpeed : 0

                        onProgress({
                            loaded: currentLoaded,
                            total: totalSize,
                            percentage: Math.round((currentLoaded / totalSize) * 100),
                            speed: avgSpeed,
                            timeRemaining: timeRemaining
                        })
                    }
                })

                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        currentXhr = null
                        resolve()
                    } else {
                        reject(new Error('Chunk upload failed'))
                    }
                })

                xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
                xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')))

                xhr.open('POST', `${API_BASE}/upload?action=chunk`)
                xhr.setRequestHeader('Authorization', `Bearer ${token}`)
                xhr.send(formData)
            })

            loadedGlobal += chunkBlob.size
        }

        // 3. FINISH
        if (cancelled) throw new Error('Upload cancelled')

        const finishResponse = await fetch(`${API_BASE}/upload?action=finish`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fileId })
        })

        if (!finishResponse.ok) {
            throw new Error('Failed to finalize upload')
        }

        return finishResponse.json()
    })()

    return {
        promise,
        abort: () => {
            cancelled = true
            if (currentXhr) {
                currentXhr.abort()
            }
        }
    }
}

// Download file with progress tracking
export const downloadFile = (fileId, fileName, onProgress) => {
    const token = getAuthToken()

    let xhr = null

    const promise = (async () => {
        const authToken = await token
        if (!authToken) throw new Error('Not authenticated')

        return new Promise((resolve, reject) => {
            xhr = new XMLHttpRequest()
            const startTime = Date.now()

            xhr.responseType = 'blob'

            xhr.addEventListener('progress', (event) => {
                if (event.lengthComputable && onProgress) {
                    const currentTime = Date.now()
                    const elapsedTime = (currentTime - startTime) / 1000 // total elapsed seconds

                    // Calculate average speed (bytes per second) from start
                    const avgSpeed = elapsedTime > 0 ? event.loaded / elapsedTime : 0

                    // Calculate time remaining based on average speed
                    const remaining = event.total - event.loaded
                    const timeRemaining = avgSpeed > 0 ? remaining / avgSpeed : 0

                    onProgress({
                        loaded: event.loaded,
                        total: event.total,
                        percentage: Math.round((event.loaded / event.total) * 100),
                        speed: avgSpeed,
                        timeRemaining: timeRemaining
                    })
                }
            })

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const blob = xhr.response
                    const url = window.URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = fileName
                    document.body.appendChild(a)
                    a.click()
                    window.URL.revokeObjectURL(url)
                    document.body.removeChild(a)
                    resolve()
                } else {
                    reject(new Error('Download failed'))
                }
            })

            xhr.addEventListener('error', () => reject(new Error('Download failed - network error')))
            xhr.addEventListener('abort', () => reject(new Error('Download cancelled')))

            xhr.open('GET', `${API_BASE}/download?fileId=${fileId}`)
            xhr.setRequestHeader('Authorization', `Bearer ${authToken}`)
            xhr.send()
        })
    })()

    return {
        promise,
        abort: () => {
            if (xhr) {
                xhr.abort()
            }
        }
    }
}

// Get storage usage
export const getStorageUsage = async () => {
    const token = await getAuthToken()
    if (!token) throw new Error('Not authenticated')

    const response = await fetch(`${API_BASE}/storage`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })

    if (!response.ok) {
        throw new Error('Failed to fetch storage usage')
    }

    return response.json()
}

// List files
export const listFiles = async () => {
    const token = await getAuthToken()
    if (!token) throw new Error('Not authenticated')

    const response = await fetch(`${API_BASE}/files`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })

    if (!response.ok) {
        throw new Error('Failed to fetch files')
    }

    const data = await response.json()
    return data.files
}

// Toggle star
export const toggleFileStar = async (fileId, isStarred) => {
    const token = await getAuthToken()
    if (!token) throw new Error('Not authenticated')

    const response = await fetch(`${API_BASE}/files?fileId=${fileId}`, {
        method: 'PATCH',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_starred: isStarred })
    })

    if (!response.ok) {
        throw new Error('Failed to update file')
    }

    return response.json()
}

// Delete file (soft)
export const deleteFile = async (fileId) => {
    const token = await getAuthToken()
    if (!token) throw new Error('Not authenticated')

    const response = await fetch(`${API_BASE}/files?fileId=${fileId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })

    if (!response.ok) {
        throw new Error('Failed to delete file')
    }

    return response.json()
}

// Delete file (permanent)
export const deleteFilePermanent = async (fileId) => {
    const token = await getAuthToken()
    if (!token) throw new Error('Not authenticated')

    const response = await fetch(`${API_BASE}/files?fileId=${fileId}&permanent=true`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })

    if (!response.ok) {
        throw new Error('Failed to delete file permanently')
    }

    return response.json()
}

// Restore file
export const restoreFile = async (fileId) => {
    const token = await getAuthToken()
    if (!token) throw new Error('Not authenticated')

    const response = await fetch(`${API_BASE}/files?fileId=${fileId}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })

    if (!response.ok) {
        throw new Error('Failed to restore file')
    }

    return response.json()
}
