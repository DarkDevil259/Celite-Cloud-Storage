import { supabase } from '../lib/supabase.js'
import { deleteChunkFromDrive } from '../lib/drive.js'

export default async function handler(req, res) {
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

        const { fileId } = req.query

        // GET - List all files
        if (req.method === 'GET' && !fileId) {
            const { data: files, error } = await supabase
                .from('files')
                .select('id, name, size, mime_type, is_starred, is_deleted, status, created_at, deleted_at')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })

            if (error) {
                throw error
            }

            return res.status(200).json({ files })
        }

        // PATCH - Update file (star/unstar)
        if (req.method === 'PATCH' && fileId) {
            const { is_starred } = req.body

            const { data, error } = await supabase
                .from('files')
                .update({ is_starred })
                .eq('id', fileId)
                .eq('user_id', user.id)
                .select()
                .single()

            if (error) {
                throw error
            }

            return res.status(200).json({ file: data })
        }

        // DELETE - Soft delete or permanent delete
        if (req.method === 'DELETE' && fileId) {
            const { permanent } = req.query

            if (permanent === 'true') {
                // Permanent delete - remove chunks from Drive and DB
                const { data: chunks, error: chunksError } = await supabase
                    .from('chunks')
                    .select(`
            *,
            drive_account:drive_accounts(*)
          `)
                    .eq('file_id', fileId)

                if (!chunksError && chunks) {
                    // Delete chunks from Drive
                    for (const chunk of chunks) {
                        try {
                            await deleteChunkFromDrive(chunk.drive_account, chunk.drive_file_id)
                        } catch (err) {
                            console.error(`Failed to delete chunk ${chunk.id}:`, err)
                        }
                    }

                    // Delete chunk records
                    await supabase
                        .from('chunks')
                        .delete()
                        .eq('file_id', fileId)
                }

                // Delete file record
                const { error } = await supabase
                    .from('files')
                    .delete()
                    .eq('id', fileId)
                    .eq('user_id', user.id)

                if (error) {
                    throw error
                }

                return res.status(200).json({ message: 'File permanently deleted' })
            } else {
                // Soft delete
                const { error } = await supabase
                    .from('files')
                    .update({
                        is_deleted: true,
                        deleted_at: new Date().toISOString()
                    })
                    .eq('id', fileId)
                    .eq('user_id', user.id)

                if (error) {
                    throw error
                }

                return res.status(200).json({ message: 'File moved to trash' })
            }
        }

        // PUT - Restore from trash
        if (req.method === 'PUT' && fileId) {
            const { error } = await supabase
                .from('files')
                .update({
                    is_deleted: false,
                    deleted_at: null
                })
                .eq('id', fileId)
                .eq('user_id', user.id)

            if (error) {
                throw error
            }

            return res.status(200).json({ message: 'File restored' })
        }

        return res.status(405).json({ error: 'Method not allowed' })

    } catch (error) {
        console.error('Files API error:', error)
        return res.status(500).json({ error: error.message })
    }
}
