//import { createClient } from './supabase-lib.js'

const SUPABASE_URL = 'https://nffzqdnjcptgutpronmm.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_r2YA3kIom0v2Qx75xnKWew_jWVT_x0X'

export const supabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
)
