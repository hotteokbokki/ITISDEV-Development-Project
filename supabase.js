// supabase.js

// Import the createClient function from the '@supabase/supabase-js' package
const { createClient } = require('@supabase/supabase-js');

// Retrieve Supabase URL and API Key from environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Create a Supabase client using the retrieved URL and API Key
const supabase = createClient(supabaseUrl, supabaseKey);

// Export the Supabase client so that it can be used in other files
module.exports = supabase;
