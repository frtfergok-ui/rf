import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the MALL AUTO WASH customer site", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /MALL AUTO WASH — автомойка нового поколения/);
  assert.match(html, /mall-autowash-logo\.png/);
  assert.match(html, /Google Maps ↗/);
  assert.match(html, /Telegram ↗/);
  assert.match(html, /Instagram ↗/);
  assert.match(html, /WhatsApp ↗/);
  assert.match(html, /TikTok ↗/);
  assert.match(html, /Записаться онлайн/);
});

test("keeps owner settings separate from the manager workspace", async () => {
  const [staffPage, settingsRoute, migration] = await Promise.all([
    readFile(new URL("../app/staff/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/settings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260807134933_add_manager_role_and_social_links.sql", import.meta.url), "utf8"),
  ]);

  assert.match(staffPage, /type StaffRole = "owner" \| "manager"/);
  assert.match(staffPage, /Панель владельца/);
  assert.match(staffPage, /Панель менеджера/);
  assert.match(staffPage, /staffRole === "owner"/);
  assert.match(staffPage, /google_maps_url/);
  assert.match(settingsRoute, /instagramUrl/);
  assert.match(settingsRoute, /googleMapsUrl/);
  assert.match(migration, /role in \('owner', 'manager'\)/);
  assert.match(migration, /owners can add managers/);
});

test("ships smart booking, customer self-service, CRM and PWA capabilities", async () => {
  const [staffPage, bookingApi, managePage, manifest, migration] = await Promise.all([
    readFile(new URL("../app/staff/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/bookings/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/manage/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260808103438_operations_crm_loyalty_schedule.sql", import.meta.url), "utf8"),
  ]);

  assert.match(staffPage, /CRM КЛИЕНТОВ/);
  assert.match(staffPage, /Двухфакторный вход/);
  assert.match(staffPage, /Отменить \+ WhatsApp/);
  assert.match(staffPage, /Попросить отзыв/);
  assert.match(bookingApi, /create_booking_secure/);
  assert.match(managePage, /Перенести запись/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(migration, /enforce_booking_capacity/);
  assert.match(migration, /owners can delete bookings/);
});
