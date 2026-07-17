import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type Frequency = 'weekly' | 'monthly' | 'yearly';

export interface Subscription {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  frequency: Frequency;
  still_using: boolean;
  created_at: string;
}

export interface DetectedCharge {
  name: string;
  amount: number;
  frequency: Frequency;
}
