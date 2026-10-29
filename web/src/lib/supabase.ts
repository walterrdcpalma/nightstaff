import { createClient } from '@supabase/supabase-js';

// Só a chave pública (anon). A service_role nunca entra no web/ (CLAUDE.md).
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anonKey) throw new Error('Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (ver web/.env.example).');

export const supabase = createClient(url, anonKey);
