import { env } from "cloudflare:workers";

type VehicleRow = { id: number; brand: string; model: string; vehicle_type: "sedan" | "crossover" | "suv" | "van"; express_price: number; complex_price: number; detailing_price: number };

function getSupabaseConfig() {
  const runtimeEnv = env as unknown as Record<string, string | undefined>;
  const supabaseUrl = "https://cnkbysjdjkhbrhwlfqpz.supabase.co";
  const publishableKey = "sb_publishable_3ZoiEU3BlvomX1lEcs8Cmw_RxFK6PcT";
  if (!supabaseUrl || !publishableKey) throw new Error("Supabase environment is not configured");
  return { supabaseUrl, publishableKey };
}

export async function GET() {
  try {
    const { supabaseUrl, publishableKey } = getSupabaseConfig();
    const query = new URLSearchParams({ select: "id,brand,model,vehicle_type,express_price,complex_price,detailing_price", active: "eq.true", order: "sort_order.asc,brand.asc,model.asc" });
    const response = await fetch(`${supabaseUrl}/rest/v1/vehicle_models?${query}`, { headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` }, cache: "no-store" });
    if (!response.ok) throw new Error("vehicle catalog");
    const rows = (await response.json()) as VehicleRow[];
    return Response.json(rows.map(row => ({ id: row.id, brand: row.brand, model: row.model, vehicleType: row.vehicle_type, prices: { express: Number(row.express_price), complex: Number(row.complex_price), detailing: Number(row.detailing_price) } })), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Не удалось загрузить каталог автомобилей" }, { status: 500 });
  }
}
