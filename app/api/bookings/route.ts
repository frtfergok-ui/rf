import { env } from "cloudflare:workers";

const allowedServices = new Set(["express", "complex", "detailing"]);
const allowedVehicleTypes = new Set(["sedan", "crossover", "suv", "van"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^\d{2}:\d{2}$/;

function getSupabaseConfig() {
  const runtimeEnv = env as unknown as Record<string, string | undefined>;
  const supabaseUrl = runtimeEnv.SUPABASE_URL || process.env.SUPABASE_URL;
  const publishableKey = runtimeEnv.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) throw new Error("Supabase environment is not configured");
  return { supabaseUrl, publishableKey };
}

async function callRpc<T>(name: string, body: Record<string, unknown>) {
  const { supabaseUrl, publishableKey } = getSupabaseConfig();
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as T | { code?: string; message?: string } | null;
  return { response, data };
}

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const date = search.get("date") ?? "";
    const service = search.get("service") ?? "complex";
    if (!datePattern.test(date) || !allowedServices.has(service)) {
      return Response.json({ error: "Некорректная дата или услуга" }, { status: 400 });
    }
    const { response, data } = await callRpc<{ durationMinutes: number; bayCount: number; slots: Array<{ time: string; availableBays: number }> }>("get_available_slots", {
      p_booking_date: date,
      p_service: service,
    });
    if (!response.ok || !data) throw new Error("availability");
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Не удалось проверить свободное время" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const fields = ["service", "vehicleType", "date", "time", "name", "phone", "car", "licensePlate"] as const;
    for (const field of fields) {
      if (typeof payload[field] !== "string" || !payload[field].trim()) {
        return Response.json({ error: "Заполните все поля" }, { status: 400 });
      }
    }

    const service = String(payload.service);
    const vehicleType = String(payload.vehicleType);
    const phone = String(payload.phone).replace(/[^\d+]/g, "");
    const name = String(payload.name).trim();
    const car = String(payload.car).trim();
    const licensePlate = String(payload.licensePlate).trim().toUpperCase();
    const date = String(payload.date);
    const time = String(payload.time);

    if (!allowedServices.has(service)) return Response.json({ error: "Выберите услугу" }, { status: 400 });
    if (!allowedVehicleTypes.has(vehicleType)) return Response.json({ error: "Выберите тип автомобиля" }, { status: 400 });
    if (!datePattern.test(date) || !timePattern.test(time)) return Response.json({ error: "Выберите время в графике работы" }, { status: 400 });
    if (phone.length < 10 || phone.length > 20) return Response.json({ error: "Проверьте номер телефона" }, { status: 400 });
    if (name.length < 2 || name.length > 80 || car.length < 2 || car.length > 120 || licensePlate.length < 2 || licensePlate.length > 20) {
      return Response.json({ error: "Проверьте имя и автомобиль" }, { status: 400 });
    }

    const { response, data } = await callRpc<{ id: string; managementToken: string; durationMinutes: number; bayNumber: number }>("create_booking_secure", {
      p_service: service,
      p_vehicle_type: vehicleType,
      p_booking_date: date,
      p_booking_time: time,
      p_customer_name: name,
      p_phone: phone,
      p_car: car,
      p_license_plate: licensePlate,
    });

    if (!response.ok) {
      const error = data as { code?: string; message?: string } | null;
      if (response.status === 409 || error?.code === "23505") {
        return Response.json({ error: "Все боксы на это время только что заняли. Выберите другой слот." }, { status: 409 });
      }
      if (error?.code === "22007") return Response.json({ error: "Это время вне графика или закрыто владельцем." }, { status: 409 });
      throw new Error(error?.message || "booking");
    }

    return Response.json({ ok: true, ...data }, { status: 201 });
  } catch {
    return Response.json({ error: "Сервис временно недоступен. Позвоните нам." }, { status: 500 });
  }
}
