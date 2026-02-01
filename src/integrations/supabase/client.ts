import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://wtdqhlhldphbkiipghpw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0ZHFobGhsZHBoYmtpaXBnaHB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NDAxMTEsImV4cCI6MjA4NTUxNjExMX0.orGr9cz0FGSvGMrETeMun168UjTI58ihaYZrIOy2A4Q";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
