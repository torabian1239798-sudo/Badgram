import { AppState, Platform } from "react-native";
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

// Badgram's public client configuration. Publishable keys are designed for
// client applications; database access is protected by RLS policies.
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://jdctjzcohearvmnhcown.supabase.co";
const supabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_lv-QlM2upnZefUBwCoTj1A_Fhd5CmXl";

export const isSupabaseConfigured =
  /^https:\/\/.+\.supabase\.co$/.test(supabaseUrl) &&
  supabaseKey.length > 20 &&
  !supabaseKey.includes("YOUR_");

export const supabase = createClient(
  isSupabaseConfigured ? supabaseUrl : "https://placeholder.supabase.co",
  isSupabaseConfigured ? supabaseKey : "placeholder-anon-key",
  {
    auth: {
      ...(Platform.OS !== "web" ? { storage: AsyncStorage } : {}),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
