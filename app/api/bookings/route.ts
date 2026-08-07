import { env } from "cloudflare:workers";

const allowedServices = new Set(["express", "complex", "detailing"]);
const allowedVehicleTypes = new Set(["sedan", "crossover", "van"]);
const allowedTimes = new Set(["10:00", "11:30", "13:00", "14:30", "16:00", "17:30", "19:00", "20:30"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function getSupabaseConfig() {
  const runtimeEnv = env as unknown as Record<string, string | undefined>;
  const supabaseUrl = runtimeEnv.SUPABASE_URL || process.env.SUPABASE_URL;
  const publishableKey = runtimeEnv.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) throw new Error("Supabase environment is not configured");
  return { supabaseUrl, publishableKey };
}

export async function GET(request: Request) {
  try {
    const date = new URL(request.url).searchParams.get("date") ?? "";
    if (!datePattern.test(date) || Number.isNaN(new Date(`${date}T12:00:00Z`).getTime())) {
      return Response.json({ error: "Некорректная дата" }, { status: 400 });
    }

    const { supabaseUrl, publishableKey } = getSupabaseConfig();
    const query = new URLSearchParams({ select: "booking_time", booking_date: `eq.${date}`, status: "in.(new,confirmed)" });
    const response = await fetch(`${supabaseUrl}/rest/v1/bookings?${query}`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Supabase request failed: ${response.status}`);

    const rows = (await response.json()) as Array<{ booking_time: string }>;
    return Response.json({ occupied: rows.map((row) => row.booking_time.slice(0, 5)) }, { headers: { "Cache-Control": "no-store" } });
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
    if (!datePattern.test(date) || !allowedTimes.has(time)) return Response.json({ error: "Выберите время в графике работы" }, { status: 400 });
    if (phone.length < 10 || phone.length > 20) return Response.json({ error: "Проверьте номер телефона" }, { status: 400 });
    if (name.length < 2 || name.length > 80 || car.length < 2 || car.length > 120 || licensePlate.length < 2 || licensePlate.length > 20) {
      return Response.json({ error: "Проверьте имя и автомобиль" }, { status: 400 });
    }

    const { supabaseUrl, publishableKey } = getSupabaseConfig();

    const response = await fetch(`${supabaseUrl}/rest/v1/bookings`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        service,
        vehicle_type: vehicleType,
        booking_date: date,
        booking_time: time,
        customer_name: name,
        phone,
        car,
        license_plate: licensePlate,
      }),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
      if (response.status === 409 || error.code === "23505") {
        return Response.json({ error: "Это время только что заняли. Выберите другой слот." }, { status: 409 });
      }
      throw new Error(error.message || `Supabase request failed: ${response.status}`);
    }

    return Response.json({ ok: true }, { status: 201 });
  } catch {
    return Response.json({ error: "Сервис временно недоступен. Позвоните нам." }, { status: 500 });
  }
}
