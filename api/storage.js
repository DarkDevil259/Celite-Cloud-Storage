import { supabase } from '../lib/supabase.js'

export default async function handler(req, res) {
    if (req.method !== 'GET') {
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

        // Get total storage from user's files (non-deleted, completed)
        const { data: files, error: filesError } = await supabase
            .from('files')
            .select('size')
            .eq('user_id', user.id)
            .eq('is_deleted', false)
            .eq('status', 'completed')

        if (filesError) {
            throw filesError
        }

        // Calculate total used storage from files
        const usedBytes = files.reduce((acc, f) => acc + (f.size || 0), 0)

        // Get all active drive accounts with details
        const { data: drives, error: drivesError } = await supabase
            .from('drive_accounts')
            .select('id, email, drive_number, storage_limit, storage_used, is_trash_drive')
            .eq('is_active', true)
            .order('drive_number', { ascending: true })

        console.log('Storage API - drives query result:', { drives, drivesError })

        if (drivesError) {
            console.error('Drive accounts query error:', drivesError)
            throw drivesError
        }

        // Calculate totals from non-trash drives
        const activeDrives = (drives || []).filter(d => !d.is_trash_drive)
        const DEFAULT_DRIVE_SIZE = 15 * 1024 * 1024 * 1024 // 15GB per drive

        let totalLimit = 0
        let totalDriveUsed = 0

        // Build per-drive details
        const driveDetails = activeDrives.map(d => {
            // Fix: if storage_limit is the old 15 billion value, use proper 15 GB
            let limit = d.storage_limit || DEFAULT_DRIVE_SIZE
            if (limit === 15000000000) {
                limit = DEFAULT_DRIVE_SIZE // Use proper 15 GB
            }
            const used = d.storage_used || 0
            totalLimit += limit
            totalDriveUsed += used

            return {
                id: d.id,
                name: `Drive ${d.drive_number}`,
                email: d.email,
                usedBytes: used,
                totalBytes: limit,
                usedGB: (used / (1024 * 1024 * 1024)).toFixed(2),
                totalGB: Math.round(limit / (1024 * 1024 * 1024)),
                percentage: limit > 0 ? Math.min((used / limit) * 100, 100) : 0
            }
        })

        // Default to 15GB if no drives configured
        if (totalLimit === 0) {
            totalLimit = DEFAULT_DRIVE_SIZE
        }

        return res.status(200).json({
            usedBytes: usedBytes,
            totalBytes: totalLimit,
            driveUsedBytes: totalDriveUsed,
            usedGB: (usedBytes / (1024 * 1024 * 1024)).toFixed(2),
            totalGB: (totalLimit / (1024 * 1024 * 1024)).toFixed(0),
            driveCount: activeDrives.length,
            drives: driveDetails
        })

    } catch (error) {
        console.error('Storage error:', error)
        return res.status(500).json({ error: error.message })
    }
}
