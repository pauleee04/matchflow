// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Normaler Supabase-Client für den Admin-Bereich und angemeldete Benutzer
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Öffentlicher Supabase-Client ohne Session-Persistenz (wird in app/page.tsx & öffentlichen Seiten genutzt)
export const publicSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

// Helper-Funktion für Admin-Abfragen mit Service-Role (nur serverseitig verwenden)
export function getAdminSupabase() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY fehlt in den Server-Umgebungsvariablen.');
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}


export async function fetchWithTimeout<T>(
  fetchPromise: Promise<T>,
  ms = 4000
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Netzwerk-Timeout')), ms)
  )
  return Promise.race([fetchPromise, timeout])
}