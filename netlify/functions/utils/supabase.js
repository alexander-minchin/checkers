import { createClient } from '@supabase/supabase-js';
export const getSupabaseAdmin = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
export const getSupabaseUser = async (context) => {
    const token = context.clientContext?.identity?.token;
    if (!token) { return { user: null, error: 'No token provided' }; }
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data, error } = await supabase.auth.getUser(token);
    return { user: data?.user, error };
}
