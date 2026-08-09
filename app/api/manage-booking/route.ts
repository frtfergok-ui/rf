import { env } from "cloudflare:workers";

function config() {
  const runtimeEnv = env as unknown as Record<string, string | undefined>;
  const url = runtimeEnv.SUPABASE_URL || process.env.SUPABASE_URL;
  const key = runtimeEnv.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("config");
  return { url, key };
}

async function rpc(name: string, body: Record<string, unknown>) {
  const { url, key } = config();
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!/^[a-f0-9]{48}$/.test(token)) return Response.json({ error: "Ссылка недействительна" }, { status: 400 });
  try {
    const { response, data } = await rpc("get_booking_secure", { p_token: token });
    if (!response.ok || !data) return Response.json({ error: "Запись не найдена" }, { status: 404 });
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Не удалось загрузить запись" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const token = String(body.token ?? "");
    const action = String(body.action ?? "");
    if (!/^[a-f0-9]{48}$/.test(token) || !["cancel", "reschedule"].includes(action)) {
      return Response.json({ error: "Некорректный запрос" }, { status: 400 });
    }
    const { response, data } = await rpc("manage_booking_secure", {
      p_token: token,
      p_action: action,
      p_booking_date: action === "reschedule" ? body.date : null,
      p_booking_time: action === "reschedule" ? body.time : null,
    });
    if (!response.ok) {
      const code = (data as { code?: string } | null)?.code;
      if (code === "23505" || code === "22007") return Response.json({ error: "Это время уже занято или недоступно" }, { status: 409 });
      return Response.json({ error: "Запись уже нельзя изменить" }, { status: 400 });
    }
    return Response.json(data);
  } catch {
    return Response.json({ error: "Не удалось изменить запись" }, { status: 500 });
  }
}
