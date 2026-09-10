import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://cnkbysjdjkhbrhwlfqpz.supabase.co";
const publishableKey = "sb_publishable_3ZoiEU3BlvomX1lEcs8Cmw_RxFK6PcT";

export const supabase = createClient(supabaseUrl, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
