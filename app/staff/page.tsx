"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase-browser";

type BookingStatus = "new" | "confirmed" | "completed" | "cancelled";

type Booking = {
  id: string;
  service: "express" | "complex" | "detailing";
  booking_date: string;
  booking_time: string;
  customer_name: string;
  phone: string | null;
  car: string;
  license_plate: string;
  booking_source: "online" | "walk_in";
  created_by: string | null;
  status: BookingStatus;
  created_at: string;
  confirmed_at: string | null;
  whatsapp_sent_at: string | null;
};

const serviceNames = { express: "Экспресс", complex: "Комплекс", detailing: "Детейлинг" };
const statusNames: Record<BookingStatus, string> = { new: "Новая", confirmed: "Подтверждена", completed: "Выполнена", cancelled: "Отменена" };
const bookingSlots = ["09:00", "10:30", "12:00", "13:30", "15:00", "16:30", "18:00", "19:30"];

function localDate(offset = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offset);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function whatsappPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? `373${digits.slice(1)}` : digits;
}

function confirmationMessage(booking: Booking) {
  const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(`${booking.booking_date}T12:00:00`));
  return `Здравствуйте, ${booking.customer_name}! Ваша запись в MALL AUTO WASH подтверждена на ${date} в ${booking.booking_time.slice(0, 5)}. Автомобиль: ${booking.car}, госномер ${booking.license_plate}. Услуга: ${serviceNames[booking.service]}. Ждём вас!`;
}

export default function StaffPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [staffName, setStaffName] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<BookingStatus | "all">("new");
  const [selectedDate, setSelectedDate] = useState("all");
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInDate, setWalkInDate] = useState(localDate());
  const [walkInTime, setWalkInTime] = useState(bookingSlots[0]);
  const [walkInSaving, setWalkInSaving] = useState(false);
  const [walkInMessage, setWalkInMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data: staff, error: staffError } = await supabase.from("staff_users").select("display_name").maybeSingle();
    if (staffError) {
      setError("Не удалось проверить доступ сотрудника.");
      setLoading(false);
      return;
    }
    if (!staff) {
      setStaffName(null);
      setBookings([]);
      setLoading(false);
      return;
    }
    setStaffName(staff.display_name);
    const { data, error: bookingError } = await supabase
      .from("bookings")
      .select("id,service,booking_date,booking_time,customer_name,phone,car,license_plate,booking_source,created_by,status,created_at,confirmed_at,whatsapp_sent_at")
      .order("booking_date", { ascending: true })
      .order("booking_time", { ascending: true });
    if (bookingError) setError("Не удалось загрузить записи.");
    else setBookings((data ?? []) as Booking[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadDashboard();
  }, [session, loadDashboard]);

  useEffect(() => {
    if (!session || !staffName) return;
    const timer = window.setInterval(loadDashboard, 30000);
    return () => window.clearInterval(timer);
  }, [session, staffName, loadDashboard]);

  const dashboardDates = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const value = new Date();
    value.setDate(value.getDate() + index);
    return {
      iso: value.toISOString().slice(0, 10),
      label: index === 0 ? "Сегодня" : new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric" }).format(value).replace(".", ""),
    };
  }), []);
  const visible = useMemo(() => bookings.filter(item =>
    (filter === "all" || item.status === filter) &&
    (selectedDate === "all" || item.booking_date === selectedDate)
  ), [bookings, filter, selectedDate]);
  const counts = useMemo(() => ({
    all: bookings.length,
    new: bookings.filter(item => item.status === "new").length,
    confirmed: bookings.filter(item => item.status === "confirmed").length,
    completed: bookings.filter(item => item.status === "completed").length,
    cancelled: bookings.filter(item => item.status === "cancelled").length,
  }), [bookings]);
  const occupiedWalkInSlots = useMemo(() => bookings
    .filter(item => item.booking_date === walkInDate && (item.status === "new" || item.status === "confirmed"))
    .map(item => item.booking_time.slice(0, 5)), [bookings, walkInDate]);

  useEffect(() => {
    if (occupiedWalkInSlots.includes(walkInTime)) {
      setWalkInTime(bookingSlots.find(slot => !occupiedWalkInSlots.includes(slot)) ?? "");
    }
  }, [occupiedWalkInSlots, walkInTime]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthMessage("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setAuthMessage("Неверный email или пароль.");
    setAuthLoading(false);
  }

  async function changeStatus(id: string, status: BookingStatus) {
    const changes: Record<string, string | null> = { status, updated_at: new Date().toISOString() };
    if (status === "confirmed") changes.confirmed_at = new Date().toISOString();
    const { error: updateError } = await supabase.from("bookings").update(changes).eq("id", id);
    if (updateError) setError("Не удалось изменить статус.");
    else setBookings(items => items.map(item => item.id === id ? { ...item, ...changes } as Booking : item));
  }

  async function createWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !walkInTime) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const phone = String(form.get("phone") ?? "").replace(/[^\d+]/g, "");
    setWalkInSaving(true);
    setWalkInMessage("");
    const { data, error: insertError } = await supabase.from("bookings").insert({
      service: String(form.get("service")),
      booking_date: walkInDate,
      booking_time: walkInTime,
      customer_name: String(form.get("name")).trim(),
      phone: phone || null,
      car: String(form.get("car")).trim(),
      license_plate: String(form.get("licensePlate")).trim().toUpperCase(),
      booking_source: "walk_in",
      created_by: session.user.id,
    }).select("id,service,booking_date,booking_time,customer_name,phone,car,license_plate,booking_source,created_by,status,created_at,confirmed_at,whatsapp_sent_at").single();

    if (insertError) {
      setWalkInMessage(insertError.code === "23505" ? "Это время уже занято — выбери другое." : "Не удалось добавить клиента. Проверь данные.");
    } else if (data) {
      setBookings(items => [...items, data as Booking].sort((a, b) => `${a.booking_date}${a.booking_time}`.localeCompare(`${b.booking_date}${b.booking_time}`)));
      formElement.reset();
      setWalkInOpen(false);
    }
    setWalkInSaving(false);
  }

  async function confirmInWhatsapp(booking: Booking) {
    if (!booking.phone) return;
    const popup = window.open("about:blank", "_blank");
    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from("bookings").update({ status: "confirmed", confirmed_at: now, whatsapp_sent_at: now, updated_at: now }).eq("id", booking.id);
    if (updateError) {
      popup?.close();
      setError("Не удалось подтвердить запись.");
      return;
    }
    setBookings(items => items.map(item => item.id === booking.id ? { ...item, status: "confirmed", confirmed_at: now, whatsapp_sent_at: now } : item));
    const url = `https://wa.me/${whatsappPhone(booking.phone)}?text=${encodeURIComponent(confirmationMessage(booking))}`;
    if (popup) popup.location.href = url;
    else window.location.href = url;
  }

  if (!authReady) return <main className="staffApp"><div className="staffLoader">Загрузка…</div></main>;

  if (!session) return <main className="staffApp loginScreen"><section className="loginCard">
    <div className="staffBrand"><b>M</b><span>MALL AUTO WASH<small>Панель сотрудника</small></span></div>
    <h1>Вход в рабочее приложение</h1><p>Введи рабочий email и пароль. После входа приложение запомнит тебя на этом устройстве.</p>
    <form onSubmit={signIn}>
      <label htmlFor="staff-email">Рабочий email</label>
      <input id="staff-email" type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} placeholder="worker@example.com" required />
      <label htmlFor="staff-password">Пароль</label>
      <input id="staff-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Введите пароль" minLength={6} required />
      <button disabled={authLoading}>{authLoading ? "Входим…" : "Войти →"}</button>
    </form>
    {authMessage && <div className="authMessage errorMessage" role="alert">{authMessage}</div>}
  </section></main>;

  if (!staffName && !loading) return <main className="staffApp loginScreen"><section className="loginCard accessCard">
    <div className="accessIcon">!</div><h1>Доступ ожидает подтверждения</h1><p>Аккаунт <b>{session.user.email}</b> создан, но ещё не добавлен в список сотрудников. Передай этот email владельцу.</p><button onClick={() => supabase.auth.signOut()}>Выйти</button>
  </section></main>;

  return <main className="staffApp">
    <header className="staffHeader"><div className="staffBrand"><b>M</b><span>MALL AUTO WASH<small>Рабочая панель</small></span></div><div className="staffUser"><span><b>{staffName}</b><small>{session.user.email}</small></span><button onClick={() => supabase.auth.signOut()}>Выйти</button></div></header>
    <section className="staffContent">
      <div className="staffTitle"><div><span>ЗАЯВКИ</span><h1>Записи клиентов</h1></div><div className="staffTitleActions"><button className="addWalkIn" onClick={() => { setWalkInOpen(current => !current); setWalkInMessage(""); }}>+ Клиент на месте</button><button onClick={loadDashboard} disabled={loading}>{loading ? "Обновляем…" : "↻ Обновить"}</button></div></div>
      <div className="staffStats"><button className={filter === "new" ? "active" : ""} onClick={() => setFilter("new")}><span>Новые</span><b>{counts.new}</b></button><button className={filter === "confirmed" ? "active" : ""} onClick={() => setFilter("confirmed")}><span>Подтверждены</span><b>{counts.confirmed}</b></button><button className={filter === "completed" ? "active" : ""} onClick={() => setFilter("completed")}><span>Выполнены</span><b>{counts.completed}</b></button><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}><span>Все</span><b>{counts.all}</b></button></div>
      <div className="staffDays"><button className={selectedDate === "all" ? "active" : ""} onClick={() => setSelectedDate("all")}>Все дни</button>{dashboardDates.map(item => <button className={selectedDate === item.iso ? "active" : ""} onClick={() => setSelectedDate(item.iso)} key={item.iso}>{item.label}</button>)}</div>
      {walkInOpen && <form className="walkInCard" onSubmit={createWalkIn}>
        <div className="walkInHead"><div><small>БЕЗ ПРЕДВАРИТЕЛЬНОЙ ЗАПИСИ</small><h2>Добавить клиента на месте</h2></div><button type="button" onClick={() => setWalkInOpen(false)} aria-label="Закрыть">×</button></div>
        <div className="walkInFields"><label>Услуга<select name="service" defaultValue="complex"><option value="express">Экспресс</option><option value="complex">Комплекс</option><option value="detailing">Детейлинг</option></select></label><label>Дата<input type="date" value={walkInDate} min={localDate()} max={localDate(90)} onChange={event => setWalkInDate(event.target.value)} required /></label></div>
        <div className="walkInSlots">{bookingSlots.map(slot => { const occupied = occupiedWalkInSlots.includes(slot); return <button type="button" className={walkInTime === slot ? "active" : ""} disabled={occupied} onClick={() => setWalkInTime(slot)} key={slot}>{slot}{occupied && <small>занято</small>}</button>; })}</div>
        {!walkInTime && <p className="walkInMessage">На этот день свободных окон нет.</p>}
        <div className="walkInFields customer"><label>Имя клиента<input name="name" minLength={2} maxLength={80} placeholder="Например, Иван" required /></label><label>Телефон — необязательно<input name="phone" type="tel" placeholder="+373 ___ ___ ___" /></label><label>Марка и модель<input name="car" minLength={2} maxLength={120} placeholder="BMW X5" required /></label><label>Госномер<input name="licensePlate" minLength={2} maxLength={20} autoCapitalize="characters" placeholder="ABC 123" required /></label></div>
        {walkInMessage && <p className="walkInMessage">{walkInMessage}</p>}
        <button className="saveWalkIn" disabled={walkInSaving || !walkInTime}>{walkInSaving ? "Добавляем…" : "Занять это время →"}</button>
      </form>}
      {error && <div className="staffError">{error}</div>}
      <div className="bookingList">{visible.length === 0 ? <div className="emptyState"><b>✓</b><h2>Здесь пока пусто</h2><p>Новые записи появятся автоматически.</p></div> : visible.map(booking => <article className="bookingItem" key={booking.id}>
        <div className="bookingWhen"><strong>{booking.booking_time.slice(0, 5)}</strong><span>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(`${booking.booking_date}T12:00:00`))}</span></div>
        <div className="bookingClient"><div className="statusLine"><i className={`statusDot ${booking.status}`} /><small>{statusNames[booking.status]}</small>{booking.booking_source === "walk_in" && <small className="walkInBadge">Клиент на месте</small>}</div><h2>{booking.customer_name}</h2><p>{booking.car} · {serviceNames[booking.service]}</p><strong className="licensePlate">{booking.license_plate}</strong>{booking.phone && <a href={`tel:${booking.phone}`}>{booking.phone}</a>}</div>
        <div className="bookingActions">{booking.status === "new" && booking.booking_source === "online" && booking.phone && <button className="whatsapp" onClick={() => confirmInWhatsapp(booking)}>WhatsApp <b>↗</b></button>}{booking.status === "new" && booking.booking_source === "walk_in" && <button className="done" onClick={() => changeStatus(booking.id, "confirmed")}>✓ Принять в работу</button>}{booking.status === "confirmed" && <button className="done" onClick={() => changeStatus(booking.id, "completed")}>✓ Выполнено</button>}{booking.status !== "cancelled" && booking.status !== "completed" && <button className="cancel" onClick={() => changeStatus(booking.id, "cancelled")}>Отменить</button>}</div>
      </article>)}</div>
    </section>
  </main>;
}
