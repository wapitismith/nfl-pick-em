import { createClient } from '@supabase/supabase-js'

// Set these in web/.env (see .env.example):
//   VITE_SUPABASE_URL=https://yourproject.supabase.co
//   VITE_SUPABASE_ANON_KEY=eyJ...
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export const SEASON = Number(import.meta.env.VITE_SEASON ?? new Date().getFullYear())
