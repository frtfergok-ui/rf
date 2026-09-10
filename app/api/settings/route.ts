import { env } from "cloudflare:workers";

type ServiceConfig = { id: "express" | "complex" | "detailing" | "wheel_cleaning" | "leather_conditioning" | "hydropolymer"; name: string; note: string; prices: Record<"sedan" | "crossover" | "van", string>; price_amounts?: Record<"sedan" | "crossover" | "van", number>; time: string; duration_minutes?: number };
type SettingsRow = { phone: string; address: string; hours: string; telegram_url: string; instagram_url: string; whatsapp_url: string; tiktok_url: string; google_maps_url: string; review_url: string; opening_time: string; closing_time: string; bay_count: number; slot_interval_minutes: number; services: ServiceConfig[] };

function getSupabaseConfig() {
  const runtimeEnv = env as unknown as Record<string, string | undefined>;
  const supabaseUrl = runtimeEnv.SUPABASE_URL || process.env.SUPABASE_URL || "https://cnkbysjdjkhbrhwlfqpz.supabase.co";
  const publishableKey = runtimeEnv.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_3ZoiEU3BlvomX1lEcs8Cmw_RxFK6PcT";
  if (!supabaseUrl || !publishableKey) throw new Error("Supabase environment is not configured");
  return { supabaseUrl, publishableKey };
}

export async function GET() {
  try {
    const { supabaseUrl, publishableKey } = getSupabaseConfig();
    const query = new URLSearchParams({ select: "phone,address,hours,telegram_url,instagram_url,whatsapp_url,tiktok_url,google_maps_url,review_url,opening_time,closing_time,bay_count,slot_interval_minutes,services", id: "eq.1" });
    const response = await fetch(`${supabaseUrl}/rest/v1/site_settings?${query}`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Supabase request failed: ${response.status}`);
    const rows = (await response.json()) as SettingsRow[];
    const row = rows[0];
    if (!row || !Array.isArray(row.services) || row.services.length < 3) throw new Error("Settings are incomplete");
    return Response.json({ phone: row.phone, address: row.address, hours: row.hours, telegramUrl: row.telegram_url, instagramUrl: row.instagram_url, whatsappUrl: row.whatsapp_url, tiktokUrl: row.tiktok_url, googleMapsUrl: row.google_maps_url, reviewUrl: row.review_url, openingTime: row.opening_time.slice(0, 5), closingTime: row.closing_time.slice(0, 5), bayCount: row.bay_count, slotIntervalMinutes: row.slot_interval_minutes, services: row.services }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Не удалось загрузить настройки" }, { status: 500 });
  }
}
