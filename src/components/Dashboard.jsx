import React, { useState, useEffect, useRef } from 'react'
import { listFiles, uploadFile, downloadFile, toggleFileStar, deleteFile, deleteFilePermanent, restoreFile, getStorageUsage } from '../lib/api'
import './Dashboard.css'

function Dashboard({ user, onLogout }) {
    const [files, setFiles] = useState([])
    const [view, setView] = useState('files') // 'files', 'starred', 'trash'
    const [sortOrder, setSortOrder] = useState('newest')
    const [searchQuery, setSearchQuery] = useState('')
    const [activeMenu, setActiveMenu] = useState(null)
    const [loading, setLoading] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(null) // { percentage, speed, timeRemaining, fileName }
    const [downloading, setDownloading] = useState(null) // { fileId, percentage, speed, timeRemaining, fileName }
    const [deleting, setDeleting] = useState(null) // fileId being deleted
    const [storage, setStorage] = useState({ usedGB: '0.00', totalGB: '15', usedBytes: 0, totalBytes: 0, driveCount: 0, drives: [] })
    const [showStorageDetails, setShowStorageDetails] = useState(false)
    const fileInputRef = useRef(null)
    const uploadControllerRef = useRef(null)
    const downloadControllerRef = useRef(null)

    // Fetch storage usage
    const fetchStorage = async () => {
        try {
            const data = await getStorageUsage()
            console.log('Storage data received:', data)
            setStorage(data)
        } catch (error) {
            console.error('Failed to fetch storage:', error)
        }
    }

    // Fetch files on mount and when view changes
    useEffect(() => {
        fetchFiles()
        fetchStorage()
    }, [])

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = () => setActiveMenu(null)
        window.addEventListener('click', handleClickOutside)
        return () => window.removeEventListener('click', handleClickOutside)
    }, [])

    const handleMenuClick = (e, id) => {
        e.stopPropagation()
        setActiveMenu(activeMenu === id ? null : id)
    }

    const fetchFiles = async () => {
        try {
            setLoading(true)
            const fetchedFiles = await listFiles()
            setFiles(fetchedFiles.map(f => ({
                ...f,
                type: getFileTypeFromMime(f.mime_type),
                isStarred: f.is_starred,
                isDeleted: f.is_deleted,
                deletedAt: f.deleted_at,
                status: f.status || 'completed',
                date: new Date(f.created_at).toISOString().split('T')[0]
            })))
        } catch (error) {
            console.error('Failed to fetch files:', error)
            alert('Failed to load files')
        } finally {
            setLoading(false)
        }
    }

    const getFileTypeFromMime = (mimeType) => {
        if (!mimeType) return 'document'
        if (mimeType.startsWith('image/')) return 'image'
        if (mimeType.startsWith('video/')) return 'video'
        if (mimeType === 'application/pdf') return 'pdf'
        if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'spreadsheet'
        if (mimeType.includes('zip') || mimeType.includes('compressed')) return 'zip'
        return 'document'
    }

    const handleUploadClick = () => {
        fileInputRef.current?.click()
    }

    const handleFileSelect = async (e) => {
        const file = e.target.files?.[0]
        if (!file) return

        try {
            setUploading(true)
            setUploadProgress({ percentage: 0, speed: 0, timeRemaining: 0, fileName: file.name, processing: false })

            const controller = uploadFile(file, (progress) => {
                // When upload reaches 100%, show processing state
                const isProcessing = progress.percentage >= 100
                setUploadProgress({
                    percentage: isProcessing ? 100 : progress.percentage,
                    speed: progress.speed,
                    timeRemaining: progress.timeRemaining,
                    fileName: file.name,
                    processing: isProcessing
                })
            })

            uploadControllerRef.current = controller

            await controller.promise

            setUploadProgress(null)
            uploadControllerRef.current = null
            alert('File uploaded successfully!')
            await fetchFiles()
            await fetchStorage()
        } catch (error) {
            console.error('Upload failed:', error)
            if (error.message !== 'Upload cancelled') {
                alert(`Upload failed: ${error.message}`)
            }
        } finally {
            setUploading(false)
            setUploadProgress(null)
            uploadControllerRef.current = null
            e.target.value = '' // Reset input
        }
    }

    // Format bytes to human readable
    const formatSpeed = (bytesPerSecond) => {
        if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`
        if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
        return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
    }

    const formatTime = (seconds) => {
        if (seconds < 60) return `${Math.round(seconds)}s`
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
        return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
    }

    const handleCancelUpload = () => {
        if (uploadControllerRef.current) {
            uploadControllerRef.current.abort()
            uploadControllerRef.current = null
        }
    }

    const handleCancelDownload = () => {
        if (downloadControllerRef.current) {
            downloadControllerRef.current.abort()
            downloadControllerRef.current = null
        }
    }


    const getFileIcon = (type) => {
        switch (type) {
            case 'pdf':
                return (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                        <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#ff4d4d" fillOpacity="0.1" />
                        <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" stroke="#ff4d4d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M14 2V8H20" stroke="#ff4d4d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M16 13H8" stroke="#ff4d4d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M16 17H8" stroke="#ff4d4d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M10 9H8" stroke="#ff4d4d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )
            case 'image':
                return (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" fill="#ff9f43" fillOpacity="0.1" />
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="#ff9f43" strokeWidth="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" fill="#ff9f43" />
                        <path d="M21 15L16 10L5 21" stroke="#ff9f43" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )
            case 'spreadsheet':
                return (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                        <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#10ac84" fillOpacity="0.1" />
                        <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" stroke="#10ac84" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M14 2V8H20" stroke="#10ac84" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M8 13H16" stroke="#10ac84" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M8 17H16" stroke="#10ac84" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M10 9H8" stroke="#10ac84" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <rect x="8" y="13" width="8" height="4" stroke="#10ac84" strokeWidth="2" />
                    </svg>
                )
            case 'video':
                return (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                        <rect x="2" y="2" width="20" height="20" rx="2.18" fill="#ef5777" fillOpacity="0.1" />
                        <rect x="2" y="2" width="20" height="20" rx="2.18" stroke="#ef5777" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M7 2V22" stroke="#ef5777" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M17 2V22" stroke="#ef5777" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M2 12H22" stroke="#ef5777" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M2 7H7" stroke="#ef5777" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M2 17H7" stroke="#ef5777" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M17 17H22" stroke="#ef5777" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M17 7H22" stroke="#ef5777" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )
            case 'zip':
                return (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                        <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#ffd32a" fillOpacity="0.1" />
                        <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" stroke="#ffd32a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M14 2V8H20" stroke="#ffd32a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M9 13V15" stroke="#ffd32a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M9 17V19" stroke="#ffd32a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M10 2V22" stroke="#ffd32a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )
            default:
                return (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                        <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#575fcf" fillOpacity="0.1" />
                        <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" stroke="#575fcf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M14 2V8H20" stroke="#575fcf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M16 13H8" stroke="#575fcf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M16 17H8" stroke="#575fcf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M10 9H8" stroke="#575fcf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )
        }
    }

    const toggleStar = async (id) => {
        const file = files.find(f => f.id === id)
        if (!file) return

        try {
            await toggleFileStar(id, !file.isStarred)
            setFiles(files.map(f => f.id === id ? { ...f, isStarred: !f.isStarred } : f))
        } catch (error) {
            console.error('Failed to toggle star:', error)
            alert('Failed to update file')
        }
    }

    const moveToTrash = async (id) => {
        try {
            setDeleting(id)
            await deleteFile(id)
            setFiles(files.map(f => f.id === id ? { ...f, isDeleted: true, deletedAt: new Date().toISOString() } : f))
            setActiveMenu(null)
        } catch (error) {
            console.error('Failed to delete file:', error)
            alert('Failed to delete file')
        } finally {
            setDeleting(null)
        }
    }

    const restoreFromTrash = async (id) => {
        try {
            setDeleting(id)
            await restoreFile(id)
            setFiles(files.map(f => f.id === id ? { ...f, isDeleted: false, deletedAt: null } : f))
            setActiveMenu(null)
        } catch (error) {
            console.error('Failed to restore file:', error)
            alert('Failed to restore file')
        } finally {
            setDeleting(null)
        }
    }

    const deletePermanently = async (id) => {
        const file = files.find(f => f.id === id)
        if (!confirm(`Permanently delete "${file?.name}"? This will remove the file from all drives and cannot be undone.`)) return

        try {
            setDeleting(id)
            await deleteFilePermanent(id)
            setFiles(files.filter(f => f.id !== id))
            setActiveMenu(null)
            await fetchStorage()
        } catch (error) {
            console.error('Failed to permanently delete file:', error)
            alert('Failed to delete file permanently')
        } finally {
            setDeleting(null)
        }
    }

    const handleDownload = async (file) => {
        // Check if file is ready for download
        if (file.status === 'uploading') {
            alert('This file is still uploading. Please wait until upload completes.')
            return
        }
        if (file.status === 'failed') {
            alert('This file failed to upload and cannot be downloaded.')
            return
        }

        try {
            // Show preparing state while server fetches from drives
            setDownloading({
                fileId: file.id,
                fileName: file.name,
                percentage: 0,
                speed: 0,
                timeRemaining: 0,
                preparing: true
            })

            const controller = downloadFile(file.id, file.name, (progress) => {
                setDownloading({
                    fileId: file.id,
                    fileName: file.name,
                    percentage: progress.percentage,
                    speed: progress.speed,
                    timeRemaining: progress.timeRemaining,
                    preparing: false
                })
            })

            downloadControllerRef.current = controller

            await controller.promise

            setDownloading(null)
            downloadControllerRef.current = null
        } catch (error) {
            console.error('Download failed:', error)
            if (error.message !== 'Download cancelled') {
                alert(`Download failed: ${error.message}`)
            }
            setDownloading(null)
            downloadControllerRef.current = null
        }
    }

    const getFilteredFiles = () => {
        let filtered = files.filter(f => {
            if (view === 'trash') return f.isDeleted
            if (view === 'starred') return f.isStarred && !f.isDeleted
            return !f.isDeleted
        })

        if (searchQuery) {
            filtered = filtered.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
        }

        return filtered.sort((a, b) => {
            if (sortOrder === 'newest') return new Date(b.date) - new Date(a.date)
            return new Date(a.date) - new Date(b.date)
        })
    }

    // Use storage data from API
    const usedStorage = storage.usedGB
    const totalStorage = storage.totalGB
    const storagePercent = storage.totalBytes > 0
        ? Math.min((storage.usedBytes / storage.totalBytes) * 100, 100)
        : 0

    const formatFileSize = (bytes) => {
        if (!bytes) return '0 B'
        const kb = bytes / 1024
        if (kb < 1024) return `${kb.toFixed(0)} KB`
        const mb = kb / 1024
        if (mb < 1024) return `${mb.toFixed(1)} MB`
        const gb = mb / 1024
        return `${gb.toFixed(2)} GB`
    }

    return (
        <div className="dashboard">
            {/* Progress Toast Notification */}
            {(uploadProgress || downloading) && (
                <div className="progress-toast">
                    <div className="progress-toast-header">
                        <div className={`progress-toast-icon ${(uploadProgress?.processing || downloading?.preparing) ? 'pulsing' : ''}`}>
                            {uploadProgress ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                    <path d="M21 15V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M17 8L12 3L7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            ) : (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                    <path d="M21 15V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            )}
                        </div>
                        <div className="progress-toast-info">
                            <span className="progress-toast-title">
                                {uploadProgress?.processing
                                    ? 'Processing...'
                                    : downloading?.preparing
                                        ? 'Preparing...'
                                        : uploadProgress
                                            ? 'Uploading'
                                            : 'Downloading'}
                            </span>
                            <span className="progress-toast-filename">
                                {uploadProgress?.fileName || downloading?.fileName}
                            </span>
                        </div>
                        <span className="progress-toast-percent">
                            {(uploadProgress?.processing || downloading?.preparing)
                                ? '...'
                                : `${uploadProgress?.percentage || downloading?.percentage || 0}%`}
                        </span>
                        <button
                            className="progress-toast-cancel"
                            onClick={uploadProgress ? handleCancelUpload : handleCancelDownload}
                            title="Cancel"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                        </button>
                    </div>
                    <div className={`progress-toast-bar ${(uploadProgress?.processing || downloading?.preparing) ? 'indeterminate' : ''}`}>
                        <div
                            className="progress-toast-bar-fill"
                            style={{
                                width: (uploadProgress?.processing || downloading?.preparing)
                                    ? '100%'
                                    : `${uploadProgress?.percentage || downloading?.percentage || 0}%`
                            }}
                        />
                    </div>
                    <div className="progress-toast-stats">
                        {(uploadProgress?.processing || downloading?.preparing) ? (
                            <>
                                <span>{uploadProgress ? 'Encrypting & uploading to cloud...' : 'Fetching from cloud...'}</span>
                                <span>Please wait</span>
                            </>
                        ) : (
                            <>
                                <span>{formatSpeed(uploadProgress?.speed || downloading?.speed || 0)}</span>
                                <span>{formatTime(uploadProgress?.timeRemaining || downloading?.timeRemaining || 0)} left</span>
                            </>
                        )}
                    </div>
                </div>
            )}


            {/* Sidebar */}
            <aside className="sidebar glass">
                <div className="sidebar-header">
                    <div className="logo">
                        <div className="logo-icon">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M19.5 10C19.5 10 19.5 7 16.5 4.5C13.5 2 10 3 8.5 4.5C7 6 6 8 6 10C4 10 2 12 2 14.5C2 17 4 19 6.5 19H18C20.5 19 22 17 22 14.5C22 12 20 10 19.5 10Z" stroke="url(#cloud-gradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <defs>
                                    <linearGradient id="cloud-gradient" x1="2" y1="4" x2="22" y2="19" gradientUnits="userSpaceOnUse">
                                        <stop stopColor="#6366f1" />
                                        <stop offset="1" stopColor="#a855f7" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>
                        <span className="logo-text">Celite<span className="gradient-text">CloudX</span></span>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    <button onClick={() => setView('files')} className={`nav-item ${view === 'files' ? 'active' : ''}`}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M3 9L12 2L21 9V20C21 21.1 20.1 22 19 22H5C3.9 22 3 21.1 3 20V9Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        My Files
                    </button>
                    <button onClick={() => setView('starred')} className={`nav-item ${view === 'starred' ? 'active' : ''}`}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Starred
                    </button>
                    <button onClick={() => setView('trash')} className={`nav-item ${view === 'trash' ? 'active' : ''}`}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <path d="M3 6H5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M19 6V20C19 21.1 18.1 22 17 22H7C5.9 22 5 21.1 5 20V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M8 6V4C8 2.9 8.9 2 10 2H14C15.1 2 16 2.9 16 4V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Trash
                    </button>
                </nav>

                {/* Storage Info - Clickable */}
                <div className="storage-info clickable" onClick={() => setShowStorageDetails(true)}>
                    <div className="storage-header">
                        <span>Storage ({storage.driveCount || 0} drives)</span>
                        <span className="storage-used">{usedStorage} GB / {totalStorage} GB</span>
                    </div>
                    <div className="storage-bar">
                        <div className="storage-fill" style={{ width: `${storagePercent}%` }}></div>
                    </div>
                    <span className="storage-hint">Click for details</span>
                </div>

                {/* Storage Details Modal */}
                {showStorageDetails && (
                    <div className="storage-modal-overlay" onClick={() => setShowStorageDetails(false)}>
                        <div className="storage-modal glass" onClick={(e) => e.stopPropagation()}>
                            <div className="storage-modal-header">
                                <h3>Storage Details</h3>
                                <button className="close-btn" onClick={() => setShowStorageDetails(false)}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    </svg>
                                </button>
                            </div>
                            <div className="storage-modal-content">
                                <div className="storage-summary">
                                    <div className="storage-circle">
                                        <svg viewBox="0 0 120 120">
                                            <defs>
                                                <linearGradient id="storage-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                                    <stop offset="0%" stopColor="#6366f1" />
                                                    <stop offset="50%" stopColor="#a855f7" />
                                                    <stop offset="100%" stopColor="#ec4899" />
                                                </linearGradient>
                                            </defs>
                                            <circle className="storage-circle-bg" cx="60" cy="60" r="50" />
                                            <circle
                                                className="storage-circle-fill"
                                                cx="60" cy="60" r="50"
                                                style={{ strokeDashoffset: 314 - (314 * storagePercent / 100) }}
                                            />
                                        </svg>
                                        <div className="storage-circle-text">
                                            <div className="storage-circle-value">{usedStorage}</div>
                                            <div className="storage-circle-unit">GB used</div>
                                        </div>
                                    </div>
                                    <div className="storage-total-info">
                                        <div className="storage-total-text">
                                            <strong>{totalStorage} GB</strong> total capacity
                                        </div>
                                        <div className="storage-drives-count">
                                            {storage.driveCount || 0} Google Drive accounts linked
                                        </div>
                                    </div>
                                </div>
                                <div className="drives-list">
                                    {(storage.drives || []).map((drive, index) => (
                                        <div key={drive.id || index} className="drive-item">
                                            <div className="drive-header">
                                                <div className="drive-icon">
                                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                                        <path d="M7 16L3 10L10 3L14 9L7 16Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                                                        <path d="M10 3L14 9L21 9L17 3L10 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                                                        <path d="M14 9L21 9L17 16L7 16L14 9Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                                                    </svg>
                                                </div>
                                                <div className="drive-info">
                                                    <span className="drive-name">{drive.name}</span>
                                                    <span className="drive-email">{drive.email}</span>
                                                </div>
                                                <span className="drive-usage">{drive.usedGB} / {drive.totalGB} GB</span>
                                            </div>
                                            <div className="drive-bar">
                                                <div
                                                    className="drive-bar-fill"
                                                    style={{ width: `${drive.percentage}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    ))}
                                    {(!storage.drives || storage.drives.length === 0) && (
                                        <div className="no-drives">
                                            No drives linked yet
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </aside>

            {/* Main Content */}
            <main className="main-content">
                {/* Header */}
                <header className="main-header">
                    <div className="search-bar">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
                            <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Search files..."
                            className="search-input"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className="header-actions">
                        <div className="user-info">
                            <span className="user-name">{user?.name || 'User'}</span>
                            <div className="user-avatar">
                                {(user?.name?.[0] || 'U').toUpperCase()}
                            </div>
                        </div>
                        <button className="btn btn-secondary" onClick={onLogout}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                                <path d="M9 21H5C3.89 21 3 20.1 3 19V5C3 3.9 3.89 3 5 3H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M16 17L21 12L16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Logout
                        </button>
                    </div>
                </header>

                {/* Hidden File Input */}
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                />

                {/* Upload Area */}
                <div className="section-header">
                    <h2>{loading ? 'Loading...' : (view === 'trash' ? 'Trash' : view === 'starred' ? 'Starred Files' : 'All Files')}</h2>
                    <div className="header-controls">
                        <div className="sort-control">
                            <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="sort-select">
                                <option value="newest">Newest First</option>
                                <option value="oldest">Oldest First</option>
                            </select>
                        </div>
                        <button className="btn btn-primary" onClick={handleUploadClick} disabled={uploading}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                <path d="M12 5V19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            {uploading ? 'Uploading...' : 'Upload File'}
                        </button>
                    </div>
                </div>

                <div className="files-list">
                    {!loading && getFilteredFiles().length > 0 && (
                        <div className="file-list-header">
                            <div className="file-col-name">Name</div>
                            <div className="file-col-date">Date modified</div>
                            <div className="file-col-size">Size</div>
                            <div className="file-col-actions"></div>
                        </div>
                    )}

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                            Loading files...
                        </div>
                    ) : getFilteredFiles().length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                            {view === 'trash' ? 'Trash is empty' : view === 'starred' ? 'No starred files' : 'No files uploaded yet'}
                        </div>
                    ) : (
                        getFilteredFiles().map((file) => (
                            <div key={file.id} className={`file-list-item glass ${deleting === file.id ? 'loading' : ''}`}>
                                {deleting === file.id && <div className="file-loading-spinner" />}

                                <div className="file-col-name" onClick={() => view !== 'trash' && handleDownload(file)} style={{ cursor: view !== 'trash' ? 'pointer' : 'default' }}>
                                    <div className="file-icon-wrapper">
                                        {getFileIcon(file.type)}
                                    </div>
                                    <span className="file-name-text">
                                        {file.name}
                                        {file.status === 'uploading' && <span className="file-status-badge uploading">Uploading</span>}
                                        {file.status === 'failed' && <span className="file-status-badge failed">Failed</span>}
                                    </span>
                                </div>

                                <div className="file-col-date">
                                    {file.date}
                                </div>

                                <div className="file-col-size">
                                    {formatFileSize(file.size)}
                                </div>

                                <div className="file-col-actions">
                                    <div className="file-actions-container">
                                        <button
                                            className="action-btn menu-btn"
                                            onClick={(e) => handleMenuClick(e, file.id)}
                                            title="Options"
                                        >
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                                                <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                                                <circle cx="12" cy="19" r="1.5" fill="currentColor" />
                                            </svg>
                                        </button>
                                        {activeMenu === file.id && (
                                            <div className="action-dropdown glass" onClick={(e) => e.stopPropagation()}>
                                                {view === 'trash' ? (
                                                    <>
                                                        <button onClick={() => { restoreFromTrash(file.id); setActiveMenu(null); }}>
                                                            Restore
                                                        </button>
                                                        <button onClick={() => { deletePermanently(file.id); setActiveMenu(null); }} className="delete-opt">
                                                            Delete Forever
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button onClick={() => { handleDownload(file); setActiveMenu(null); }}>
                                                            Download
                                                        </button>
                                                        <button onClick={() => { toggleStar(file.id); setActiveMenu(null); }}>
                                                            {file.isStarred ? 'Unstar' : 'Add to Starred'}
                                                        </button>
                                                        <button onClick={() => { moveToTrash(file.id); setActiveMenu(null); }} className="delete-opt">
                                                            Move to Trash
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </main>
        </div >
    )
}

export default Dashboard
