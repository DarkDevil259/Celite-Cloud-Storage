import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables (needed here because ESM imports are hoisted)
dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials in environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
