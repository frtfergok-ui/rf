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
  phone: string;
  car: string;
  status: BookingStatus;
  created_at: string;
  confirmed_at: string | null;
  whatsapp_sent_at: string | null;
};

const serviceNames = { express: "Экспресс", complex: "Комплекс", detailing: "Детейлинг" };
const statusNames: Record<BookingStatus, string> = { new: "Новая", confirmed: "Подтверждена", completed: "Выполнена", cancelled: "Отменена" };

function whatsappPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? `373${digits.slice(1)}` : digits;
}

function confirmationMessage(booking: Booking) {
  const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(`${booking.booking_date}T12:00:00`));
  return `Здравствуйте, ${booking.customer_name}! Ваша запись в MALL AUTO WASH подтверждена на ${date} в ${booking.booking_time.slice(0, 5)}. Услуга: ${serviceNames[booking.service]}. Ждём вас!`;
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
      .select("id,service,booking_date,booking_time,customer_name,phone,car,status,created_at,confirmed_at,whatsapp_sent_at")
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

  const visible = useMemo(() => filter === "all" ? bookings : bookings.filter(item => item.status === filter), [bookings, filter]);
  const counts = useMemo(() => ({
    all: bookings.length,
    new: bookings.filter(item => item.status === "new").length,
    confirmed: bookings.filter(item => item.status === "confirmed").length,
    completed: bookings.filter(item => item.status === "completed").length,
    cancelled: bookings.filter(item => item.status === "cancelled").length,
  }), [bookings]);

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

  async function confirmInWhatsapp(booking: Booking) {
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
      <div className="staffTitle"><div><span>ЗАЯВКИ</span><h1>Записи клиентов</h1></div><button onClick={loadDashboard} disabled={loading}>{loading ? "Обновляем…" : "↻ Обновить"}</button></div>
      <div className="staffStats"><button className={filter === "new" ? "active" : ""} onClick={() => setFilter("new")}><span>Новые</span><b>{counts.new}</b></button><button className={filter === "confirmed" ? "active" : ""} onClick={() => setFilter("confirmed")}><span>Подтверждены</span><b>{counts.confirmed}</b></button><button className={filter === "completed" ? "active" : ""} onClick={() => setFilter("completed")}><span>Выполнены</span><b>{counts.completed}</b></button><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}><span>Все</span><b>{counts.all}</b></button></div>
      {error && <div className="staffError">{error}</div>}
      <div className="bookingList">{visible.length === 0 ? <div className="emptyState"><b>✓</b><h2>Здесь пока пусто</h2><p>Новые записи появятся автоматически.</p></div> : visible.map(booking => <article className="bookingItem" key={booking.id}>
        <div className="bookingWhen"><strong>{booking.booking_time.slice(0, 5)}</strong><span>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(`${booking.booking_date}T12:00:00`))}</span></div>
        <div className="bookingClient"><div className="statusLine"><i className={`statusDot ${booking.status}`} /><small>{statusNames[booking.status]}</small></div><h2>{booking.customer_name}</h2><p>{booking.car} · {serviceNames[booking.service]}</p><a href={`tel:${booking.phone}`}>{booking.phone}</a></div>
        <div className="bookingActions">{booking.status === "new" && <button className="whatsapp" onClick={() => confirmInWhatsapp(booking)}>WhatsApp <b>↗</b></button>}{booking.status === "confirmed" && <button className="done" onClick={() => changeStatus(booking.id, "completed")}>✓ Выполнено</button>}{booking.status !== "cancelled" && booking.status !== "completed" && <button className="cancel" onClick={() => changeStatus(booking.id, "cancelled")}>Отменить</button>}</div>
      </article>)}</div>
    </section>
  </main>;
}
