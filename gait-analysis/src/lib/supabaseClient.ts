// src/lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

let supabase: ReturnType<typeof createClient> | null = null;

try {
  if (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http')) {
    supabase = createClient(supabaseUrl, supabaseAnonKey)
  } else {
    console.warn("Supabase API anahtarları eksik veya hatalı formatta.")
  }
} catch (err) {
  console.error("Supabase başlatılamadı:", err)
}

export const supabaseBucket = import.meta.env.VITE_SUPABASE_BUCKET as string | undefined
export default supabase