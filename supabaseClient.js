import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://kwtgafdhyioacpaqllmf.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_eb_SVGHIQ9pqeIt2WKvIGg_6V3Pp6en'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
