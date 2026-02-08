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
export const uploadFile = async (file, onProgress) => {
    const token = await getAuthToken()
    if (!token) throw new Error('Not authenticated')

    const formData = new FormData()
    formData.append('file', file)

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        const startTime = Date.now()
        let lastLoaded = 0
        let lastTime = startTime

        xhr.upload.addEventListener('progress', (event) => {
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
                try {
                    const response = JSON.parse(xhr.responseText)
                    resolve(response)
                } catch {
                    resolve({ success: true })
                }
            } else {
                try {
                    const error = JSON.parse(xhr.responseText)
                    reject(new Error(error.error || 'Upload failed'))
                } catch {
                    reject(new Error('Upload failed'))
                }
            }
        })

        xhr.addEventListener('error', () => reject(new Error('Upload failed - network error')))
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')))

        xhr.open('POST', `${API_BASE}/upload`)
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.send(formData)
    })
}

// Download file with progress tracking
export const downloadFile = async (fileId, fileName, onProgress) => {
    const token = await getAuthToken()
    if (!token) throw new Error('Not authenticated')

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        const startTime = Date.now()
        let lastLoaded = 0
        let lastTime = startTime

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
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.send()
    })
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
