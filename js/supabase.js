import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://ahvuhiocbtkqqulbziql.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFodnVoaW9jYnRrcXF1bGJ6aXFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4ODA4ODgsImV4cCI6MjA5MjQ1Njg4OH0.FaR8ecAWpEbcTHEv3q6GG4gTHWP0RsmKti5vUA1b6V8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);