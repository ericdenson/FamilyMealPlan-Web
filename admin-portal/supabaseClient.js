// Family Meal Plan - Supabase Web Portal Client
// NOTE: Make sure the Supabase SDK is loaded in the HTML before this file (<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>)

// Pull credentials securely from the local config object (ignored by GitHub)
const SUPABASE_URL = window.ENV.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.ENV.SUPABASE_ANON_KEY;

// Initialize the Supabase client
const dbClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Export for global use in other files
window.dbClient = dbClient;

console.log("Supabase Client JS Initialized (Requires valid keys to establish connection)");

