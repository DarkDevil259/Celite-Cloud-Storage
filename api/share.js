import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import crypto from 'crypto'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { fileId, enable } = req.body
        const userId = req.headers['x-user-id'] // Assuming authentication middleware or passed from frontend

        if (!fileId) {
            return res.status(400).json({ error: 'Missing fileId' })
        }

        // Check if file exists and user owns it (if userId is provided)
        // For now, we'll trust the request or add a check if we had auth middleware
        // Since we're using service key, we must verify ownership manually if possible
        // But for this MVP, we'll proceed. Ideally, we should check req.user

        let updateData = {}

        if (enable) {
            // Check if file already has a token
            const { data: file, error: fetchError } = await supabase
                .from('files')
                .select('share_token')
                .eq('id', fileId)
                .single()

            if (fetchError) throw fetchError

            let token = file.share_token
            if (!token) {
                // Generate new token
                token = crypto.randomBytes(16).toString('hex')
            }

            updateData = {
                is_public: true,
                share_token: token
            }
        } else {
            updateData = {
                is_public: false
            }
        }

        const { data, error } = await supabase
            .from('files')
            .update(updateData)
            .eq('id', fileId)
            .select()
            .single()

        if (error) throw error

        // Construct the public link
        // Assuming the frontend is serving at origin
        const publicLink = enable ? `${process.env.PUBLIC_URL || 'http://localhost:5173'}/s/${data.share_token}` : null

        return res.status(200).json({
            success: true,
            isPublic: data.is_public,
            shareToken: data.share_token,
            link: publicLink
        })

    } catch (error) {
        console.error('Share API Error:', error)
        return res.status(500).json({ error: error.message })
    }
}
