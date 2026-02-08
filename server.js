import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'

// Load environment variables
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors())
app.use(express.json())

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'CeliteCloudX Backend is running',
        timestamp: new Date().toISOString()
    })
})

// Import public download handler
import publicDownloadHandler from './api/public_download.js'

// Database connection test
app.get('/api/db-test', async (req, res) => {
    try {
        const { supabase } = await import('./lib/supabase.js')

        // Test database connection by querying drive_accounts
        const { data, error } = await supabase
            .from('drive_accounts')
            .select('drive_number, email, is_active, is_trash_drive')
            .order('drive_number')

        if (error) {
            throw error
        }

        res.json({
            status: 'success',
            message: 'Database connection successful',
            driveAccounts: data.length,
            drives: data
        })
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Database connection failed',
            error: error.message
        })
    }
})

// Public download route
app.get('/s/:token', publicDownloadHandler)

// Import and mount API routes
const mountApiRoutes = async () => {
    const apiDir = join(__dirname, 'api')
    const apiFiles = fs.readdirSync(apiDir).filter(file => file.endsWith('.js'))

    for (const file of apiFiles) {
        const routeName = file.replace('.js', '')
        const routePath = `/api/${routeName}`

        app.all(routePath, async (req, res) => {
            try {
                const module = await import(`./api/${file}`)
                const handler = module.default

                if (typeof handler === 'function') {
                    await handler(req, res)
                } else {
                    res.status(500).json({ error: 'Invalid API handler' })
                }
            } catch (error) {
                console.error(`Error in ${routePath}:`, error)
                res.status(500).json({ error: error.message })
            }
        })

        console.log(`✓ Mounted API route: ${routePath}`)
    }
}

// Start server
const startServer = async () => {
    await mountApiRoutes()

    app.listen(PORT, () => {
        console.log('\n🚀 CeliteCloudX Backend Server')
        console.log('================================')
        console.log(`Server running on: http://localhost:${PORT}`)
        console.log(`Health check: http://localhost:${PORT}/api/health`)
        console.log(`Database test: http://localhost:${PORT}/api/db-test`)
        console.log('\nAPI Endpoints:')
        console.log('  POST /api/upload   - Upload files')
        console.log('  GET  /api/files    - List files')
        console.log('  GET  /api/download - Download files')
        console.log('================================\n')
    })
}

startServer().catch(error => {
    console.error('Failed to start server:', error)
    process.exit(1)
})
