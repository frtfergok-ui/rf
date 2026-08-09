"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type ManagedBooking = {
  id: string;
  service: "express" | "complex" | "detailing";
  vehicleType: "sedan" | "crossover" | "van";
  date: string;
  time: string;
  customerName: string;
  phone: string;
  car: string;
  licensePlate: string;
  status: "new" | "confirmed" | "completed" | "cancelled";
  durationMinutes: number;
};

type Slot = { time: string; availableBays: number };

function localDate(offset = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offset);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function businessWhatsapp(text: string) {
  return `https://wa.me/37368210010?text=${encodeURIComponent(text)}`;
}

export default function ManageBookingPage() {
  const [token, setToken] = useState("");
  const [booking, setBooking] = useState<ManagedBooking | null>(null);
  const [date, setDate] = useState(localDate());
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<"rescheduled" | "cancelled" | null>(null);

  useEffect(() => {
    const nextToken = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(nextToken);
    if (!nextToken) {
      setMessage("Ссылка на запись недействительна.");
      setLoading(false);
      return;
    }
    fetch(`/api/manage-booking?token=${encodeURIComponent(nextToken)}`, { cache: "no-store" })
      .then(async response => {
        const data = await response.json() as ManagedBooking & { error?: string };
        if (!response.ok) throw new Error(data.error || "Запись не найдена");
        return data;
      })
      .then(data => {
        setBooking(data);
        setDate(data.date);
        setTime(data.time.slice(0, 5));
      })
      .catch(error => setMessage(error instanceof Error ? error.message : "Запись не найдена"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!booking || booking.status === "cancelled" || booking.status === "completed") return;
    fetch(`/api/bookings?date=${encodeURIComponent(date)}&service=${encodeURIComponent(booking.service)}`, { cache: "no-store" })
      .then(response => response.json())
      .then((data: { slots?: Slot[] }) => setSlots(data.slots ?? []))
      .catch(() => setSlots([]));
  }, [booking, date]);

  const whatsappText = useMemo(() => {
    if (!booking || !result) return "";
    if (result === "cancelled") return `Здравствуйте! ${booking.customerName} отменил(а) запись MALL AUTOWASH для ${booking.car}, госномер ${booking.licensePlate}.`;
    return `Здравствуйте! ${booking.customerName} перенёс(ла) запись MALL AUTOWASH на ${date} в ${time}. Автомобиль ${booking.car}, госномер ${booking.licensePlate}.`;
  }, [booking, result, date, time]);

  async function reschedule(event: FormEvent) {
    event.preventDefault();
    if (!booking || !time) return;
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/manage-booking", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "reschedule", date, time }),
    });
    const data = await response.json() as ManagedBooking & { error?: string };
    if (!response.ok) setMessage(data.error || "Не удалось перенести запись");
    else {
      setBooking(current => current ? { ...current, date, time: `${time}:00` } : current);
      setResult("rescheduled");
    }
    setSaving(false);
  }

  async function cancelBooking() {
    if (!booking || !window.confirm("Точно отменить запись?")) return;
    setSaving(true);
    const response = await fetch("/api/manage-booking", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, action: "cancel" }),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) setMessage(data.error || "Не удалось отменить запись");
    else {
      setBooking(current => current ? { ...current, status: "cancelled" } : current);
      setResult("cancelled");
    }
    setSaving(false);
  }

  return <main className="managePage">
    <section className="manageCard">
      <a className="manageLogo" href="/"><img src="/mall-autowash-logo.png" alt="MALL AUTOWASH" /></a>
      {loading ? <div className="manageLoading">Загружаем запись…</div> : !booking ? <div className="manageEmpty"><b>!</b><h1>Запись не найдена</h1><p>{message}</p><a href="/">Вернуться на сайт</a></div> : <>
        <span className="manageEyebrow">УПРАВЛЕНИЕ ЗАПИСЬЮ</span>
        <h1>{booking.customerName}, всё под контролем</h1>
        <div className="manageSummary"><div><small>Автомобиль</small><b>{booking.car}</b><em>{booking.licensePlate}</em></div><div><small>Текущее время</small><b>{booking.date}</b><em>{booking.time.slice(0, 5)}</em></div></div>
        {result ? <div className="manageResult"><b>✓</b><h2>{result === "cancelled" ? "Запись отменена" : "Запись перенесена"}</h2><p>Сообщи об изменении в рабочий WhatsApp — текст уже подготовлен.</p><a href={businessWhatsapp(whatsappText)} target="_blank" rel="noreferrer">Открыть WhatsApp →</a><button onClick={() => setResult(null)}>{result === "cancelled" ? "Закрыть" : "Изменить ещё раз"}</button></div> : booking.status === "cancelled" || booking.status === "completed" ? <div className="manageEmpty"><h2>{booking.status === "cancelled" ? "Эта запись отменена" : "Эта запись уже выполнена"}</h2><a href="/#booking">Создать новую запись</a></div> : <form onSubmit={reschedule}>
          <h2>Перенести запись</h2>
          <label>Новая дата<input type="date" value={date} min={localDate()} max={localDate(90)} onChange={event => setDate(event.target.value)} required /></label>
          <div className="manageSlots">{slots.map(slot => <button type="button" className={time === slot.time ? "active" : ""} disabled={slot.availableBays <= 0} onClick={() => setTime(slot.time)} key={slot.time}>{slot.time}<small>{slot.availableBays <= 0 ? "занято" : `${slot.availableBays} мест`}</small></button>)}</div>
          {message && <p className="manageError">{message}</p>}
          <button className="manageSave" disabled={saving || !time}>{saving ? "Сохраняем…" : "Сохранить новое время →"}</button>
          <button className="manageCancel" type="button" onClick={cancelBooking} disabled={saving}>Отменить запись</button>
        </form>}
      </>}
    </section>
  </main>;
}
