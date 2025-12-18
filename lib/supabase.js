// Supabase Client Configuration
// MVP Strategic Planning Tool

const SUPABASE_URL = 'https://fyhkhjjcogknrrrdcszc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5aGtoampjb2drbnJycmRjc3pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNTkxOTIsImV4cCI6MjA4MTYzNTE5Mn0.b2sEc_Z-AJHOE-2aBGzYJCB461jn3YEHCcOSXz__GwE';

// Initialize Supabase client
function initializeSupabase() {
    console.log('Attempting to initialize Supabase...');
    console.log('window.supabase:', typeof window.supabase);

    // Try different ways to access createClient
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        // Standard Supabase JS v2 CDN format
        window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase client initialized successfully');
        return true;
    }

    // Check if it's under a different structure
    if (typeof supabase !== 'undefined' && typeof supabase.createClient === 'function') {
        window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase client initialized (global supabase)');
        return true;
    }

    console.error('Supabase library not found. Available on window:', Object.keys(window).filter(k => k.toLowerCase().includes('supa')));
    return false;
}

// Try to initialize immediately
if (!initializeSupabase()) {
    // If failed, try again after a short delay (in case CDN is still loading)
    console.log('Supabase not ready, will retry...');
    setTimeout(() => {
        if (!window.supabaseClient) {
            initializeSupabase();
        }
    }, 100);
}

// Also expose the init function so it can be called manually if needed
window.initializeSupabase = initializeSupabase;
