import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables (needed here because ESM imports are hoisted)
dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in environment variables')
}

// Export client (will be null if credentials missing) or create a dummy one that throws on usage?
// Better to export null and let usage throw TypeError which is caught by API handlers.
// But we need to use 'export const' so we can't reassign.
export const supabase = (supabaseUrl && supabaseKey)
    ? createClient(supabaseUrl, supabaseKey)
    : new Proxy({}, {
        get: () => { throw new Error('Supabase client not initialized: Missing credentials') }
    })
