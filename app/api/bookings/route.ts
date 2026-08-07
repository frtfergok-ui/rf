import { env } from "cloudflare:workers";

const allowedServices = new Set(["express", "complex", "detailing"]);

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const fields = ["service", "date", "time", "name", "phone", "car", "licensePlate"] as const;
    for (const field of fields) {
      if (typeof payload[field] !== "string" || !payload[field].trim()) {
        return Response.json({ error: "Заполните все поля" }, { status: 400 });
      }
    }

    const service = String(payload.service);
    const phone = String(payload.phone).replace(/[^\d+]/g, "");
    const name = String(payload.name).trim();
    const car = String(payload.car).trim();
    const licensePlate = String(payload.licensePlate).trim().toUpperCase();
    const date = String(payload.date);
    const time = String(payload.time);

    if (!allowedServices.has(service)) return Response.json({ error: "Выберите услугу" }, { status: 400 });
    if (phone.length < 10 || phone.length > 20) return Response.json({ error: "Проверьте номер телефона" }, { status: 400 });
    if (name.length < 2 || name.length > 80 || car.length < 2 || car.length > 120 || licensePlate.length < 2 || licensePlate.length > 20) {
      return Response.json({ error: "Проверьте имя и автомобиль" }, { status: 400 });
    }

    const runtimeEnv = env as unknown as Record<string, string | undefined>;
    const supabaseUrl = runtimeEnv.SUPABASE_URL || process.env.SUPABASE_URL;
    const publishableKey = runtimeEnv.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !publishableKey) throw new Error("Supabase environment is not configured");

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
