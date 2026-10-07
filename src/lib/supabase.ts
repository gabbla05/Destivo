import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Pobieranie zmiennych ze środowiska Expo (.env) z poprawnymi wartościami rezerwowymi
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://zvfbzyhefkrkfewrzkry.supabase.co';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2ZmJ6eWhlZmtya2Zld3J6a3J5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2NjIyODAsImV4cCI6MjEwMTIzODI4MH0.2DmlpnbYV6vNSVI1Rifv0Qjw3mrTKQlARDulqexNX-o';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});