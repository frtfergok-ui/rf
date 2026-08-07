import { getDb } from "../../../db";
import { bookings } from "../../../db/schema";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const fields = ["service", "date", "time", "name", "phone", "car"] as const;
    for (const field of fields) {
      if (typeof payload[field] !== "string" || !payload[field].trim()) {
        return Response.json({ error: "Заполните все поля" }, { status: 400 });
      }
    }
    const phone = String(payload.phone).replace(/[^\d+]/g, "");
    if (phone.length < 10) return Response.json({ error: "Проверьте номер телефона" }, { status: 400 });

    const db = getDb();
    const [booking] = await db.insert(bookings).values({
      service: String(payload.service), bookingDate: String(payload.date), bookingTime: String(payload.time),
      customerName: String(payload.name).trim(), phone, car: String(payload.car).trim(),
    }).returning();
    return Response.json({ booking }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось создать запись";
    if (message.includes("UNIQUE") || message.includes("idx_bookings_slot")) {
      return Response.json({ error: "Это время только что заняли. Выберите другой слот." }, { status: 409 });
    }
    return Response.json({ error: "Сервис временно недоступен. Позвоните нам." }, { status: 500 });
  }
}
