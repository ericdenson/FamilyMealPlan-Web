// Family Meal Plan - Supabase Web Portal Client
// NOTE: Make sure the Supabase SDK is loaded in the HTML before this file (<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>)

// TODO: Replace these with your actual Supabase project credentials from Settings > API
const SUPABASE_URL = 'https://fqhyzrfaacnxqrbznmwo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_sU9ZTwddoYCOo0NdsSOP1w_qdFo-RM5';

// Initialize the Supabase client
const dbClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Export for global use in other files
window.dbClient = dbClient;

console.log("Supabase Client JS Initialized (Requires valid keys to establish connection)");
