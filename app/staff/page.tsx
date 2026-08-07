"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase-browser";

type BookingStatus = "new" | "confirmed" | "completed" | "cancelled";

type Booking = {
  id: string;
  service: "express" | "complex" | "detailing";
  vehicle_type: "sedan" | "crossover" | "van";
  booking_date: string;
  booking_time: string;
  customer_name: string;
  phone: string;
  car: string;
  license_plate: string;
  booking_source: "online" | "walk_in";
  created_by: string | null;
  status: BookingStatus;
  created_at: string;
  confirmed_at: string | null;
  whatsapp_sent_at: string | null;
};

type StaffRole = "owner" | "worker";
type ServiceConfig = { id: Booking["service"]; name: string; note: string; prices: Record<Booking["vehicle_type"], string>; time: string };
type SiteSettings = { phone: string; address: string; hours: string; telegram_url: string; services: ServiceConfig[] };

const defaultSiteSettings: SiteSettings = {
  phone: "+7 999 123-45-67",
  address: "ул. Автомобильная, 12",
  hours: "Ежедневно 08:00–22:00",
  telegram_url: "https://t.me/",
  services: [
    { id: "express", name: "Экспресс", note: "Кузов · диски · сушка", prices: { sedan: "350 ₽", crossover: "450 ₽", van: "550 ₽" }, time: "25 мин" },
    { id: "complex", name: "Комплекс", note: "Кузов · салон · стёкла", prices: { sedan: "790 ₽", crossover: "950 ₽", van: "1 150 ₽" }, time: "55 мин" },
    { id: "detailing", name: "Детейлинг", note: "Глубокая чистка и защита", prices: { sedan: "от 2 900 ₽", crossover: "от 3 500 ₽", van: "от 4 200 ₽" }, time: "2–3 часа" },
  ],
};
const statusNames: Record<BookingStatus, string> = { new: "Новая", confirmed: "Подтверждена", completed: "Выполнена", cancelled: "Отменена" };
const bookingSlots = ["09:00", "10:30", "12:00", "13:30", "15:00", "16:30", "18:00", "19:30"];
const vehicleNames: Record<Booking["vehicle_type"], string> = { sedan: "Седан", crossover: "Кроссовер", van: "Бус" };

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

function confirmationMessage(booking: Booking, serviceName: string) {
  const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(`${booking.booking_date}T12:00:00`));
  return `Здравствуйте, ${booking.customer_name}! Ваша запись в MALL AUTO WASH подтверждена на ${date} в ${booking.booking_time.slice(0, 5)}. Автомобиль: ${booking.car}, ${vehicleNames[booking.vehicle_type].toLowerCase()}, госномер ${booking.license_plate}. Услуга: ${serviceName}. Ждём вас!`;
}

function readyMessage(booking: Booking) {
  return `Здравствуйте, ${booking.customer_name}! Ваша машина готова. Автомобиль ${booking.car}, госномер ${booking.license_plate}, находится на парковочном месте на подземной парковке. Можно забирать. MALL AUTO WASH`;
}

export default function StaffPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [staffName, setStaffName] = useState<string | null>(null);
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null);
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(defaultSiteSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<BookingStatus | "all">("new");
  const [selectedDate, setSelectedDate] = useState("all");
  const [search, setSearch] = useState("");
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInDate, setWalkInDate] = useState(localDate());
  const [walkInTime, setWalkInTime] = useState(bookingSlots[0]);
  const [walkInSaving, setWalkInSaving] = useState(false);
  const [walkInMessage, setWalkInMessage] = useState("");
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(localDate());
  const [rescheduleTime, setRescheduleTime] = useState(bookingSlots[0]);
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [rescheduleMessage, setRescheduleMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data: staff, error: staffError } = await supabase.from("staff_users").select("display_name,role").maybeSingle();
    if (staffError) {
      setError("Не удалось проверить доступ сотрудника.");
      setLoading(false);
      return;
    }
    if (!staff) {
      setStaffName(null);
      setStaffRole(null);
      setBookings([]);
      setLoading(false);
      return;
    }
    setStaffName(staff.display_name);
    setStaffRole(staff.role as StaffRole);
    const { data: settings } = await supabase.from("site_settings").select("phone,address,hours,telegram_url,services").eq("id", 1).maybeSingle();
    if (settings) setSiteSettings(settings as SiteSettings);
    const { data, error: bookingError } = await supabase
      .from("bookings")
      .select("id,service,vehicle_type,booking_date,booking_time,customer_name,phone,car,license_plate,booking_source,created_by,status,created_at,confirmed_at,whatsapp_sent_at")
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
  const serviceNames = useMemo(() => Object.fromEntries(siteSettings.services.map(item => [item.id, item.name])) as Record<Booking["service"], string>, [siteSettings.services]);
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ru-RU");
    return bookings.filter(item =>
      (filter === "all" || item.status === filter) &&
      (selectedDate === "all" || item.booking_date === selectedDate) &&
      (!query || `${item.customer_name} ${item.phone} ${item.car} ${item.license_plate}`.toLocaleLowerCase("ru-RU").includes(query))
    );
  }, [bookings, filter, selectedDate, search]);
  const counts = useMemo(() => ({
    all: bookings.length,
    new: bookings.filter(item => item.status === "new").length,
    confirmed: bookings.filter(item => item.status === "confirmed").length,
    completed: bookings.filter(item => item.status === "completed").length,
    cancelled: bookings.filter(item => item.status === "cancelled").length,
  }), [bookings]);
  const report = useMemo(() => {
    const today = localDate();
    const weekStart = localDate(-6);
    const monthStart = `${today.slice(0, 7)}-01`;
    const completed = bookings.filter(item => item.status === "completed");
    const completedMonth = completed.filter(item => item.booking_date >= monthStart && item.booking_date <= today);
    return {
      today: completed.filter(item => item.booking_date === today).length,
      week: completed.filter(item => item.booking_date >= weekStart && item.booking_date <= today).length,
      month: completedMonth.length,
      online: completedMonth.filter(item => item.booking_source === "online").length,
      walkIn: completedMonth.filter(item => item.booking_source === "walk_in").length,
    };
  }, [bookings]);
  const occupiedWalkInSlots = useMemo(() => bookings
    .filter(item => item.booking_date === walkInDate && (item.status === "new" || item.status === "confirmed"))
    .map(item => item.booking_time.slice(0, 5)), [bookings, walkInDate]);
  const reschedulingBooking = useMemo(() => bookings.find(item => item.id === reschedulingId) ?? null, [bookings, reschedulingId]);
  const occupiedRescheduleSlots = useMemo(() => bookings
    .filter(item => item.id !== reschedulingId && item.booking_date === rescheduleDate && (item.status === "new" || item.status === "confirmed"))
    .map(item => item.booking_time.slice(0, 5)), [bookings, rescheduleDate, reschedulingId]);

  useEffect(() => {
    if (occupiedWalkInSlots.includes(walkInTime)) {
      setWalkInTime(bookingSlots.find(slot => !occupiedWalkInSlots.includes(slot)) ?? "");
    }
  }, [occupiedWalkInSlots, walkInTime]);

  useEffect(() => {
    if (occupiedRescheduleSlots.includes(rescheduleTime)) {
      setRescheduleTime(bookingSlots.find(slot => !occupiedRescheduleSlots.includes(slot)) ?? "");
    }
  }, [occupiedRescheduleSlots, rescheduleTime]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthMessage("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setAuthMessage("Неверный email или пароль.");
    setAuthLoading(false);
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (staffRole !== "owner") return;
    const form = new FormData(event.currentTarget);
    const services = defaultSiteSettings.services.map(item => ({
      id: item.id,
      name: String(form.get(`${item.id}_name`) ?? "").trim(),
      note: String(form.get(`${item.id}_note`) ?? "").trim(),
      prices: {
        sedan: String(form.get(`${item.id}_price_sedan`) ?? "").trim(),
        crossover: String(form.get(`${item.id}_price_crossover`) ?? "").trim(),
        van: String(form.get(`${item.id}_price_van`) ?? "").trim(),
      },
      time: String(form.get(`${item.id}_time`) ?? "").trim(),
    }));
    const nextSettings: SiteSettings = {
      phone: String(form.get("phone") ?? "").trim(),
      address: String(form.get("address") ?? "").trim(),
      hours: String(form.get("hours") ?? "").trim(),
      telegram_url: String(form.get("telegram_url") ?? "").trim(),
      services,
    };
    setSettingsSaving(true);
    setSettingsMessage("");
    const { error: updateError } = await supabase.from("site_settings").update({ ...nextSettings, updated_at: new Date().toISOString() }).eq("id", 1);
    if (updateError) setSettingsMessage("Не удалось сохранить настройки. Проверь все поля.");
    else {
      setSiteSettings(nextSettings);
      setSettingsOpen(false);
    }
    setSettingsSaving(false);
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
    if (phone.length < 10 || phone.length > 20) {
      setWalkInMessage("Введи правильный номер телефона.");
      return;
    }
    setWalkInSaving(true);
    setWalkInMessage("");
    const { data, error: insertError } = await supabase.from("bookings").insert({
      service: String(form.get("service")),
      vehicle_type: String(form.get("vehicleType")),
      booking_date: walkInDate,
      booking_time: walkInTime,
      customer_name: String(form.get("name")).trim(),
      phone,
      car: String(form.get("car")).trim(),
      license_plate: String(form.get("licensePlate")).trim().toUpperCase(),
      booking_source: "walk_in",
      created_by: session.user.id,
    }).select("id,service,vehicle_type,booking_date,booking_time,customer_name,phone,car,license_plate,booking_source,created_by,status,created_at,confirmed_at,whatsapp_sent_at").single();

    if (insertError) {
      setWalkInMessage(insertError.code === "23505" ? "Это время уже занято — выбери другое." : "Не удалось добавить клиента. Проверь данные.");
    } else if (data) {
      setBookings(items => [...items, data as Booking].sort((a, b) => `${a.booking_date}${a.booking_time}`.localeCompare(`${b.booking_date}${b.booking_time}`)));
      formElement.reset();
      setWalkInOpen(false);
    }
    setWalkInSaving(false);
  }

  function openReschedule(booking: Booking) {
    setReschedulingId(booking.id);
    setRescheduleDate(booking.booking_date);
    setRescheduleTime(booking.booking_time.slice(0, 5));
    setRescheduleMessage("");
  }

  async function saveReschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reschedulingBooking || !rescheduleTime) return;
    setRescheduleSaving(true);
    setRescheduleMessage("");
    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from("bookings").update({ booking_date: rescheduleDate, booking_time: rescheduleTime, updated_at: now }).eq("id", reschedulingBooking.id);
    if (updateError) {
      setRescheduleMessage(updateError.code === "23505" ? "Это время уже занято — выбери другое." : "Не удалось перенести запись.");
    } else {
      setBookings(items => items.map(item => item.id === reschedulingBooking.id ? { ...item, booking_date: rescheduleDate, booking_time: `${rescheduleTime}:00` } : item).sort((a, b) => `${a.booking_date}${a.booking_time}`.localeCompare(`${b.booking_date}${b.booking_time}`)));
      setReschedulingId(null);
    }
    setRescheduleSaving(false);
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
    const url = `https://wa.me/${whatsappPhone(booking.phone)}?text=${encodeURIComponent(confirmationMessage(booking, serviceNames[booking.service]))}`;
    if (popup) popup.location.href = url;
    else window.location.href = url;
  }

  async function completeInWhatsapp(booking: Booking) {
    const popup = window.open("about:blank", "_blank");
    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from("bookings").update({ status: "completed", updated_at: now }).eq("id", booking.id);
    if (updateError) {
      popup?.close();
      setError("Не удалось отметить машину готовой.");
      return;
    }
    setBookings(items => items.map(item => item.id === booking.id ? { ...item, status: "completed" } : item));
    const url = `https://wa.me/${whatsappPhone(booking.phone)}?text=${encodeURIComponent(readyMessage(booking))}`;
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
    <header className="staffHeader"><div className="staffBrand"><b>M</b><span>MALL AUTO WASH<small>{staffRole === "owner" ? "Панель владельца" : "Рабочая панель"}</small></span></div><div className="staffUser"><span><b>{staffName}</b><small>{session.user.email}</small></span><button onClick={() => supabase.auth.signOut()}>Выйти</button></div></header>
    <section className="staffContent">
      <div className="staffTitle"><div><span>ЗАЯВКИ</span><h1>Записи клиентов</h1></div><div className="staffTitleActions">{staffRole === "owner" && <button className="ownerSettingsButton" onClick={() => { setSettingsOpen(true); setSettingsMessage(""); }}>⚙ Настройки сайта</button>}<button className="addWalkIn" onClick={() => { setWalkInOpen(current => !current); setWalkInMessage(""); }}>+ Клиент на месте</button><button onClick={loadDashboard} disabled={loading}>{loading ? "Обновляем…" : "↻ Обновить"}</button></div></div>
      <div className="staffStats"><button className={filter === "new" ? "active" : ""} onClick={() => setFilter("new")}><span>Новые</span><b>{counts.new}</b></button><button className={filter === "confirmed" ? "active" : ""} onClick={() => setFilter("confirmed")}><span>Подтверждены</span><b>{counts.confirmed}</b></button><button className={filter === "completed" ? "active" : ""} onClick={() => setFilter("completed")}><span>Выполнены</span><b>{counts.completed}</b></button><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}><span>Все</span><b>{counts.all}</b></button></div>
      {staffRole === "owner" && <section className="staffReport" aria-label="Отчёт по выполненным машинам"><div className="reportHead"><span>ОТЧЁТ ВЛАДЕЛЬЦА</span><h2>Результаты мойки</h2><small>Работники этот блок не видят</small></div><div className="reportNumbers"><div><span>Сегодня</span><b>{report.today}</b><small>машин</small></div><div><span>7 дней</span><b>{report.week}</b><small>машин</small></div><div className="reportAccent"><span>Этот месяц</span><b>{report.month}</b><small>машин</small></div><div><span>Онлайн</span><b>{report.online}</b><small>за месяц</small></div><div><span>Без записи</span><b>{report.walkIn}</b><small>за месяц</small></div></div></section>}
      <div className="staffSearch"><span>⌕</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Поиск по имени, телефону, машине или госномеру" aria-label="Поиск заявок" />{search && <button onClick={() => setSearch("")} aria-label="Очистить поиск">×</button>}</div>
      <div className="staffDays"><button className={selectedDate === "all" ? "active" : ""} onClick={() => setSelectedDate("all")}>Все дни</button>{dashboardDates.map(item => <button className={selectedDate === item.iso ? "active" : ""} onClick={() => setSelectedDate(item.iso)} key={item.iso}>{item.label}</button>)}</div>
      {walkInOpen && <form className="walkInCard" onSubmit={createWalkIn}>
        <div className="walkInHead"><div><small>БЕЗ ПРЕДВАРИТЕЛЬНОЙ ЗАПИСИ</small><h2>Добавить клиента на месте</h2></div><button type="button" onClick={() => setWalkInOpen(false)} aria-label="Закрыть">×</button></div>
        <div className="walkInFields walkInThree"><label>Тип машины<select name="vehicleType" defaultValue="sedan"><option value="sedan">Седан</option><option value="crossover">Кроссовер</option><option value="van">Бус</option></select></label><label>Услуга<select name="service" defaultValue="complex">{siteSettings.services.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Дата<input type="date" value={walkInDate} min={localDate()} max={localDate(90)} onChange={event => setWalkInDate(event.target.value)} required /></label></div>
        <div className="walkInSlots">{bookingSlots.map(slot => { const occupied = occupiedWalkInSlots.includes(slot); return <button type="button" className={walkInTime === slot ? "active" : ""} disabled={occupied} onClick={() => setWalkInTime(slot)} key={slot}>{slot}{occupied && <small>занято</small>}</button>; })}</div>
        {!walkInTime && <p className="walkInMessage">На этот день свободных окон нет.</p>}
        <div className="walkInFields customer"><label>Имя клиента<input name="name" minLength={2} maxLength={80} placeholder="Например, Иван" required /></label><label>Телефон<input name="phone" type="tel" minLength={10} maxLength={20} placeholder="+373 ___ ___ ___" required /></label><label>Марка и модель<input name="car" minLength={2} maxLength={120} placeholder="BMW X5" required /></label><label>Госномер<input name="licensePlate" minLength={2} maxLength={20} autoCapitalize="characters" placeholder="ABC 123" required /></label></div>
        {walkInMessage && <p className="walkInMessage">{walkInMessage}</p>}
        <button className="saveWalkIn" disabled={walkInSaving || !walkInTime}>{walkInSaving ? "Добавляем…" : "Занять это время →"}</button>
      </form>}
      {error && <div className="staffError">{error}</div>}
      <div className="bookingList">{visible.length === 0 ? <div className="emptyState"><b>{search ? "⌕" : "✓"}</b><h2>{search ? "Ничего не найдено" : "Здесь пока пусто"}</h2><p>{search ? "Проверь имя, телефон или госномер." : "Новые записи появятся автоматически."}</p></div> : visible.map(booking => <article className="bookingItem" key={booking.id}>
        <div className="bookingWhen"><strong>{booking.booking_time.slice(0, 5)}</strong><span>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(`${booking.booking_date}T12:00:00`))}</span></div>
        <div className="bookingClient"><div className="statusLine"><i className={`statusDot ${booking.status}`} /><small>{statusNames[booking.status]}</small>{booking.booking_source === "walk_in" && <small className="walkInBadge">Клиент на месте</small>}</div><h2>{booking.customer_name}</h2><p>{booking.car} · {vehicleNames[booking.vehicle_type]} · {serviceNames[booking.service]}</p><strong className="licensePlate">{booking.license_plate}</strong>{booking.phone && <a href={`tel:${booking.phone}`}>{booking.phone}</a>}</div>
        <div className="bookingActions">{booking.status === "new" && booking.booking_source === "online" && booking.phone && <button className="whatsapp" onClick={() => confirmInWhatsapp(booking)}>WhatsApp <b>↗</b></button>}{booking.status === "new" && booking.booking_source === "walk_in" && <button className="done" onClick={() => changeStatus(booking.id, "confirmed")}>✓ Принять в работу</button>}{booking.status === "confirmed" && <button className="ready" onClick={() => completeInWhatsapp(booking)}>Машина готова <b>↗</b></button>}{booking.status !== "cancelled" && booking.status !== "completed" && <button className="reschedule" onClick={() => openReschedule(booking)}>Перенести</button>}{booking.status !== "cancelled" && booking.status !== "completed" && <button className="cancel" onClick={() => changeStatus(booking.id, "cancelled")}>Отменить</button>}</div>
      </article>)}</div>
    </section>
    {reschedulingBooking && <div className="rescheduleOverlay" role="dialog" aria-modal="true" aria-labelledby="reschedule-title"><form className="rescheduleCard" onSubmit={saveReschedule}>
      <div className="walkInHead"><div><small>ИЗМЕНЕНИЕ ЗАПИСИ</small><h2 id="reschedule-title">Перенести {reschedulingBooking.customer_name}</h2><p>{reschedulingBooking.car} · {reschedulingBooking.license_plate}</p></div><button type="button" onClick={() => setReschedulingId(null)} aria-label="Закрыть">×</button></div>
      <label className="rescheduleDate">Новая дата<input type="date" value={rescheduleDate} min={localDate()} max={localDate(90)} onChange={event => setRescheduleDate(event.target.value)} required /></label>
      <div className="walkInSlots">{bookingSlots.map(slot => { const occupied = occupiedRescheduleSlots.includes(slot); return <button type="button" className={rescheduleTime === slot ? "active" : ""} disabled={occupied} onClick={() => setRescheduleTime(slot)} key={slot}>{slot}{occupied && <small>занято</small>}</button>; })}</div>
      {!rescheduleTime && <p className="walkInMessage">На этот день свободных окон нет.</p>}
      {rescheduleMessage && <p className="walkInMessage">{rescheduleMessage}</p>}
      <button className="saveWalkIn" disabled={rescheduleSaving || !rescheduleTime}>{rescheduleSaving ? "Переносим…" : "Сохранить новое время →"}</button>
    </form></div>}
    {settingsOpen && staffRole === "owner" && <div className="rescheduleOverlay" role="dialog" aria-modal="true" aria-labelledby="settings-title"><form className="rescheduleCard settingsCard" onSubmit={saveSettings}>
      <div className="walkInHead"><div><small>ТОЛЬКО ДЛЯ ВЛАДЕЛЬЦА</small><h2 id="settings-title">Настройки сайта</h2><p>После сохранения данные сразу обновятся на сайте клиентов.</p></div><button type="button" onClick={() => setSettingsOpen(false)} aria-label="Закрыть">×</button></div>
      <div className="settingsGrid"><label>Телефон<input name="phone" type="tel" minLength={5} maxLength={30} defaultValue={siteSettings.phone} required /></label><label>Адрес<input name="address" minLength={3} maxLength={160} defaultValue={siteSettings.address} required /></label><label>График работы<input name="hours" minLength={3} maxLength={80} defaultValue={siteSettings.hours} required /></label><label>Ссылка Telegram<input name="telegram_url" type="url" minLength={8} maxLength={200} defaultValue={siteSettings.telegram_url} required /></label></div>
      <div className="serviceSettings"><small>УСЛУГИ И ЦЕНЫ ПО ТИПУ МАШИНЫ</small>{siteSettings.services.map((item, index) => <fieldset key={item.id}><legend>0{index + 1}</legend><label>Название<input name={`${item.id}_name`} minLength={1} maxLength={50} defaultValue={item.name} required /></label><label>Описание<input name={`${item.id}_note`} minLength={1} maxLength={120} defaultValue={item.note} required /></label><label>Седан<input name={`${item.id}_price_sedan`} minLength={1} maxLength={40} defaultValue={item.prices.sedan} required /></label><label>Кроссовер<input name={`${item.id}_price_crossover`} minLength={1} maxLength={40} defaultValue={item.prices.crossover} required /></label><label>Бус<input name={`${item.id}_price_van`} minLength={1} maxLength={40} defaultValue={item.prices.van} required /></label><label>Длительность<input name={`${item.id}_time`} minLength={1} maxLength={40} defaultValue={item.time} required /></label></fieldset>)}</div>
      {settingsMessage && <p className="walkInMessage">{settingsMessage}</p>}
      <button className="saveWalkIn" disabled={settingsSaving}>{settingsSaving ? "Сохраняем…" : "Сохранить и обновить сайт →"}</button>
    </form></div>}
  </main>;
}
