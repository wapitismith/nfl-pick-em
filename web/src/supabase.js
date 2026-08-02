import { createClient } from '@supabase/supabase-js'

// Set these in web/.env (see .env.example):
//   VITE_SUPABASE_URL=https://yourproject.supabase.co
//   VITE_SUPABASE_ANON_KEY=eyJ...
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export const SEASON = Number(import.meta.env.VITE_SEASON ?? new Date().getFullYear())

// Commissioner's Venmo handle (the part after venmo.com/u/). Optional —
// the "Pay with Venmo" button is hidden when unset.
export const VENMO_USER = import.meta.env.VITE_VENMO_USER ?? ''

export const venmoLink = amount =>
  `https://venmo.com/u/${VENMO_USER}?txn=pay&amount=${amount.toFixed(2)}` +
  `&note=${encodeURIComponent('NFL Pick-Em dues')}`
