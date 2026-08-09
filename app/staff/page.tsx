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
  duration_minutes: number;
  price_amount: number;
  bay_number: number | null;
  customer_id: string | null;
  assigned_to: string | null;
  completed_by: string | null;
  rescheduled_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  review_sent_at: string | null;
  reminder_sent_at: string | null;
  customers?: { visits: number; loyalty_points: number; total_spent: number } | null;
};

type StaffRole = "owner" | "manager";
type ServiceConfig = { id: Booking["service"]; name: string; note: string; prices: Record<Booking["vehicle_type"], string>; price_amounts?: Record<Booking["vehicle_type"], number>; time: string; duration_minutes?: number };
type SiteSettings = { phone: string; address: string; hours: string; telegram_url: string; instagram_url: string; whatsapp_url: string; tiktok_url: string; google_maps_url: string; review_url: string; opening_time: string; closing_time: string; bay_count: number; slot_interval_minutes: number; services: ServiceConfig[] };
type AccessRequest = { user_id: string; email: string; display_name: string; status: "pending" | "approved" | "rejected"; created_at: string };
type TeamMember = { id: string; email: string; display_name: string; role: StaffRole; active: boolean; created_at: string };
type Customer = { id: string; phone: string; display_name: string; last_car: string; last_license_plate: string; visits: number; loyalty_points: number; total_spent: number; last_visit_at: string | null; notes: string };
type Closure = { id: string; closure_date: string; start_time: string | null; end_time: string | null; reason: string; created_at: string };
type AuditLog = { id: number; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; details: Record<string, unknown>; created_at: string };
type AvailabilitySlot = { time: string; availableBays: number };
type VehicleModel = { id: number; brand: string; model: string; vehicle_type: Booking["vehicle_type"]; express_price: number; complex_price: number; detailing_price: number; active: boolean; sort_order: number };

const defaultSiteSettings: SiteSettings = {
  phone: "+7 999 123-45-67",
  address: "ул. Автомобильная, 12",
  hours: "Ежедневно 10:00–22:00",
  telegram_url: "https://t.me/",
  instagram_url: "https://www.instagram.com/",
  whatsapp_url: "https://wa.me/37368210010",
  tiktok_url: "https://www.tiktok.com/",
  google_maps_url: "https://www.google.com/maps/search/?api=1&query=BALTI+EVIMALL",
  review_url: "https://www.google.com/maps/search/?api=1&query=BALTI+EVIMALL",
  opening_time: "10:00",
  closing_time: "22:00",
  bay_count: 2,
  slot_interval_minutes: 30,
  services: [
    { id: "express", name: "Экспресс", note: "Кузов · диски · сушка", prices: { sedan: "350 ₽", crossover: "450 ₽", van: "550 ₽" }, time: "25 мин" },
    { id: "complex", name: "Комплекс", note: "Кузов · салон · стёкла", prices: { sedan: "790 ₽", crossover: "950 ₽", van: "1 150 ₽" }, time: "55 мин" },
    { id: "detailing", name: "Детейлинг", note: "Глубокая чистка и защита", prices: { sedan: "от 2 900 ₽", crossover: "от 3 500 ₽", van: "от 4 200 ₽" }, time: "2–3 часа" },
  ],
};
const statusNames: Record<BookingStatus, string> = { new: "Новая", confirmed: "Подтверждена", completed: "Выполнена", cancelled: "Отменена" };
const bookingSlots = ["10:00", "11:30", "13:00", "14:30", "16:00", "17:30", "19:00", "20:30"];
const vehicleNames: Record<Booking["vehicle_type"], string> = { sedan: "Седан", crossover: "Кроссовер", van: "Минивэн" };

function localDate(offset = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offset);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function generateSlots(opening: string, closing: string, interval: number) {
  const [openHour, openMinute] = opening.slice(0, 5).split(":").map(Number);
  const [closeHour, closeMinute] = closing.slice(0, 5).split(":").map(Number);
  const start = openHour * 60 + openMinute;
  const end = closeHour * 60 + closeMinute;
  const values: string[] = [];
  for (let minute = start; minute < end; minute += interval) values.push(`${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);
  return values;
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

function rescheduledMessage(booking: Booking, dateValue: string, timeValue: string) {
  const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(`${dateValue}T12:00:00`));
  return `Здравствуйте, ${booking.customer_name}! Ваша запись в MALL AUTO WASH перенесена на ${date} в ${timeValue}. Автомобиль ${booking.car}, госномер ${booking.license_plate}. Ждём вас!`;
}

function cancelledMessage(booking: Booking) {
  return `Здравствуйте, ${booking.customer_name}! Ваша запись в MALL AUTO WASH на ${booking.booking_date} в ${booking.booking_time.slice(0, 5)} отменена. Если захотите выбрать другое время — мы всегда на связи.`;
}

function reviewMessage(booking: Booking, reviewUrl: string) {
  return `Здравствуйте, ${booking.customer_name}! Спасибо, что выбрали MALL AUTO WASH. Будем рады вашей оценке в Google Maps: ${reviewUrl}`;
}

function reminderMessage(booking: Booking) {
  const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(`${booking.booking_date}T12:00:00`));
  return `Здравствуйте, ${booking.customer_name}! Напоминаем о вашей записи в MALL AUTO WASH ${date} в ${booking.booking_time.slice(0, 5)}. Автомобиль ${booking.car}, госномер ${booking.license_plate}. До встречи!`;
}

export default function StaffPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authMessage, setAuthMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaMessage, setMfaMessage] = useState("");
  const [mfaQr, setMfaQr] = useState("");
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [staffName, setStaffName] = useState<string | null>(null);
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null);
  const [requestStatus, setRequestStatus] = useState<AccessRequest["status"] | null>(null);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [teamOpen, setTeamOpen] = useState(false);
  const [customersOpen, setCustomersOpen] = useState(false);
  const [scheduleSettingsOpen, setScheduleSettingsOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [teamMessage, setTeamMessage] = useState("");
  const [siteSettings, setSiteSettings] = useState<SiteSettings>(defaultSiteSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [vehiclesOpen, setVehiclesOpen] = useState(false);
  const [vehicleModels, setVehicleModels] = useState<VehicleModel[]>([]);
  const [vehicleMessage, setVehicleMessage] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<BookingStatus | "all">("new");
  const [selectedDate, setSelectedDate] = useState("all");
  const [search, setSearch] = useState("");
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInDate, setWalkInDate] = useState(localDate());
  const [walkInTime, setWalkInTime] = useState(bookingSlots[0]);
  const [walkInService, setWalkInService] = useState<Booking["service"]>("complex");
  const [walkInSlots, setWalkInSlots] = useState<AvailabilitySlot[]>(bookingSlots.map(time => ({ time, availableBays: 1 })));
  const [walkInSaving, setWalkInSaving] = useState(false);
  const [walkInMessage, setWalkInMessage] = useState("");
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(localDate());
  const [rescheduleTime, setRescheduleTime] = useState(bookingSlots[0]);
  const [rescheduleSlots, setRescheduleSlots] = useState<AvailabilitySlot[]>(bookingSlots.map(time => ({ time, availableBays: 1 })));
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [rescheduleMessage, setRescheduleMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [liveAlerts, setLiveAlerts] = useState(false);
  const [toast, setToast] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data: staff, error: staffError } = await supabase.from("staff_users").select("display_name,role").eq("id", session?.user.id ?? "").maybeSingle();
    if (staffError) {
      setError("Не удалось проверить доступ сотрудника.");
      setLoading(false);
      return;
    }
    if (!staff) {
      setStaffName(null);
      setStaffRole(null);
      setBookings([]);
      const { data: request } = await supabase.from("staff_access_requests").select("status").eq("user_id", session?.user.id ?? "").maybeSingle();
      setRequestStatus((request?.status as AccessRequest["status"] | undefined) ?? null);
      setLoading(false);
      return;
    }
    setStaffName(staff.display_name);
    setStaffRole(staff.role as StaffRole);
    setRequestStatus(null);
    const { data: settings } = await supabase.from("site_settings").select("phone,address,hours,telegram_url,instagram_url,whatsapp_url,tiktok_url,google_maps_url,review_url,opening_time,closing_time,bay_count,slot_interval_minutes,services").eq("id", 1).maybeSingle();
    if (settings) setSiteSettings(settings as SiteSettings);
    const { data: vehicleRows } = await supabase.from("vehicle_models").select("id,brand,model,vehicle_type,express_price,complex_price,detailing_price,active,sort_order").order("sort_order").order("brand").order("model");
    setVehicleModels((vehicleRows ?? []) as VehicleModel[]);
    if (staff.role === "owner") {
      const [{ data: requests }, { data: team }, { data: customerRows }, { data: closureRows }, { data: auditRows }] = await Promise.all([
        supabase.from("staff_access_requests").select("user_id,email,display_name,status,created_at").order("created_at", { ascending: false }),
        supabase.from("staff_users").select("id,email,display_name,role,active,created_at").order("created_at", { ascending: true }),
        supabase.from("customers").select("id,phone,display_name,last_car,last_license_plate,visits,loyalty_points,total_spent,last_visit_at,notes").order("updated_at", { ascending: false }).limit(200),
        supabase.from("business_closures").select("id,closure_date,start_time,end_time,reason,created_at").gte("closure_date", localDate()).order("closure_date", { ascending: true }),
        supabase.from("audit_logs").select("id,actor_id,action,entity_type,entity_id,details,created_at").order("created_at", { ascending: false }).limit(100),
      ]);
      setAccessRequests((requests ?? []) as AccessRequest[]);
      setTeamMembers((team ?? []) as TeamMember[]);
      setCustomers((customerRows ?? []) as Customer[]);
      setClosures((closureRows ?? []) as Closure[]);
      setAuditLogs((auditRows ?? []) as AuditLog[]);
    }
    const { data, error: bookingError } = await supabase
      .from("bookings")
      .select("id,service,vehicle_type,booking_date,booking_time,customer_name,phone,car,license_plate,booking_source,created_by,status,created_at,confirmed_at,whatsapp_sent_at,duration_minutes,price_amount,bay_number,customer_id,assigned_to,completed_by,rescheduled_at,cancelled_at,cancel_reason,review_sent_at,reminder_sent_at,customers(visits,loyalty_points,total_spent)")
      .order("booking_date", { ascending: true })
      .order("booking_time", { ascending: true });
    if (bookingError) setError("Не удалось загрузить записи.");
    else setBookings((data ?? []).map(row => ({
      ...row,
      customers: Array.isArray(row.customers) ? (row.customers[0] ?? null) : row.customers,
    })) as unknown as Booking[]);
    setLoading(false);
  }, [session?.user.id]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadDashboard();
  }, [session, loadDashboard]);

  useEffect(() => {
    if (!session) return;
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      setMfaRequired(data?.currentLevel === "aal1" && data?.nextLevel === "aal2");
    });
  }, [session]);

  useEffect(() => {
    if (!session || !staffName) return;
    const timer = window.setInterval(loadDashboard, 30000);
    return () => window.clearInterval(timer);
  }, [session, staffName, loadDashboard]);

  useEffect(() => {
    if (!session || !staffName) return;
    const channel = supabase.channel(`staff-bookings-${session.user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bookings" }, payload => {
        const next = payload.new as Booking;
        setBookings(items => items.some(item => item.id === next.id) ? items : [...items, next].sort((a, b) => `${a.booking_date}${a.booking_time}`.localeCompare(`${b.booking_date}${b.booking_time}`)));
        setToast(`Новая запись: ${next.customer_name} · ${next.booking_time.slice(0, 5)}`);
        if (liveAlerts) {
          const audio = new AudioContext();
          const oscillator = audio.createOscillator();
          const gain = audio.createGain();
          oscillator.frequency.value = 880;
          gain.gain.setValueAtTime(0.18, audio.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.35);
          oscillator.connect(gain).connect(audio.destination);
          oscillator.start();
          oscillator.stop(audio.currentTime + 0.35);
          if ("Notification" in window && Notification.permission === "granted") new Notification("MALL AUTOWASH", { body: `${next.customer_name} записался на ${next.booking_time.slice(0, 5)}` });
        }
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, staffName, liveAlerts]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function enableLiveAlerts() {
    if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission();
    setLiveAlerts(true);
    setToast("Звук и уведомления включены");
  }

  useEffect(() => {
    if (!session || !staffName) return;
    supabase.rpc("get_available_slots", { p_booking_date: walkInDate, p_service: walkInService })
      .then(({ data }) => {
        const slots = ((data as { slots?: AvailabilitySlot[] } | null)?.slots ?? []);
        setWalkInSlots(slots);
        setWalkInTime(current => slots.some(slot => slot.time === current && slot.availableBays > 0) ? current : (slots.find(slot => slot.availableBays > 0)?.time ?? ""));
      });
  }, [session, staffName, walkInDate, walkInService, bookings]);

  useEffect(() => {
    const currentBooking = bookings.find(item => item.id === reschedulingId);
    if (!currentBooking) return;
    supabase.rpc("get_available_slots", { p_booking_date: rescheduleDate, p_service: currentBooking.service })
      .then(({ data }) => {
        const slots = ((data as { slots?: AvailabilitySlot[] } | null)?.slots ?? []);
        setRescheduleSlots(slots);
        setRescheduleTime(current => slots.some(slot => slot.time === current && slot.availableBays > 0) ? current : (slots.find(slot => slot.availableBays > 0)?.time ?? ""));
      });
  }, [reschedulingId, rescheduleDate, bookings]);

  const dashboardDates = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const value = new Date();
    value.setDate(value.getDate() + index);
    return {
      iso: value.toISOString().slice(0, 10),
      label: index === 0 ? "Сегодня" : new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric" }).format(value).replace(".", ""),
    };
  }), []);
  const serviceNames = useMemo(() => Object.fromEntries(siteSettings.services.map(item => [item.id, item.name])) as Record<Booking["service"], string>, [siteSettings.services]);
  const pendingRequests = useMemo(() => accessRequests.filter(item => item.status === "pending"), [accessRequests]);
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
      revenue: completedMonth.reduce((sum, item) => sum + Number(item.price_amount || 0), 0),
      popular: (["express", "complex", "detailing"] as Booking["service"][]).sort((a, b) => completedMonth.filter(item => item.service === b).length - completedMonth.filter(item => item.service === a).length)[0],
      load: Math.min(100, Math.round((bookings.filter(item => item.booking_date >= monthStart && item.booking_date <= today && item.status !== "cancelled").length / Math.max(1, 30 * siteSettings.bay_count * 8)) * 100)),
    };
  }, [bookings, siteSettings.bay_count]);
  const reschedulingBooking = useMemo(() => bookings.find(item => item.id === reschedulingId) ?? null, [bookings, reschedulingId]);
  const scheduleDate = selectedDate === "all" ? localDate() : selectedDate;
  const scheduleSlots = useMemo(() => generateSlots(siteSettings.opening_time, siteSettings.closing_time, siteSettings.slot_interval_minutes), [siteSettings.opening_time, siteSettings.closing_time, siteSettings.slot_interval_minutes]);
  const scheduleBookings = useMemo(() => bookings.filter(item => item.booking_date === scheduleDate && (item.status === "new" || item.status === "confirmed")), [bookings, scheduleDate]);

  function openWalkInAt(slot: string) {
    setWalkInDate(scheduleDate);
    setWalkInTime(slot);
    setWalkInOpen(true);
    setWalkInMessage("");
  }

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthMessage("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setAuthMessage(signInError.message.toLowerCase().includes("confirm") ? "Сначала подтверди email. Нажми «Повторить письмо» ниже." : "Неверный email или пароль.");
    setAuthLoading(false);
  }

  async function sendPasswordReset() {
    if (!email) {
      setAuthMessage("Сначала введи рабочий email.");
      return;
    }
    setAuthLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/staff` });
    setAuthMessage(resetError ? "Не удалось отправить письмо. Попробуй позже." : "Ссылка для нового пароля отправлена на email.");
    setAuthLoading(false);
  }

  async function resendConfirmation() {
    if (!email) {
      setAuthMessage("Сначала введи рабочий email.");
      return;
    }
    setAuthLoading(true);
    const { error: resendError } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${window.location.origin}/staff` } });
    setAuthMessage(resendError ? "Не удалось отправить письмо повторно." : "Новое письмо подтверждения отправлено.");
    setAuthLoading(false);
  }

  async function updateRecoveredPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextPassword = String(form.get("newPassword") ?? "");
    const { error: updateError } = await supabase.auth.updateUser({ password: nextPassword });
    if (updateError) setAuthMessage("Не удалось изменить пароль. Минимум 8 символов.");
    else {
      setPasswordRecovery(false);
      setAuthMessage("");
    }
  }

  async function verifyMfa(event: FormEvent) {
    event.preventDefault();
    setMfaMessage("");
    const factors = await supabase.auth.mfa.listFactors();
    const factor = factors.data?.totp.find(item => item.status === "verified");
    if (!factor) {
      setMfaMessage("Подтверждённый Authenticator не найден.");
      return;
    }
    const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (challenge.error) {
      setMfaMessage("Не удалось создать проверку.");
      return;
    }
    const verify = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.data.id, code: mfaCode });
    if (verify.error) setMfaMessage("Неверный код Authenticator.");
    else setMfaRequired(false);
  }

  async function startMfaEnrollment() {
    setMfaMessage("");
    const enrollment = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "MALL AUTOWASH" });
    if (enrollment.error) setMfaMessage("Не удалось начать настройку 2FA.");
    else {
      setMfaFactorId(enrollment.data.id);
      setMfaQr(enrollment.data.totp.qr_code);
    }
  }

  async function finishMfaEnrollment() {
    if (!mfaFactorId || !mfaCode) return;
    const challenge = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
    if (challenge.error) return setMfaMessage("Не удалось проверить код.");
    const verify = await supabase.auth.mfa.verify({ factorId: mfaFactorId, challengeId: challenge.data.id, code: mfaCode });
    if (verify.error) setMfaMessage("Код неверный — проверь Authenticator.");
    else {
      setMfaMessage("Двухфакторная защита включена.");
      setMfaQr("");
      setMfaFactorId("");
      setMfaCode("");
    }
  }

  async function register(event: FormEvent) {
    event.preventDefault();
    setAuthLoading(true);
    setAuthMessage("");
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName.trim() } },
    });
    if (signUpError) setAuthMessage(signUpError.message.toLowerCase().includes("already") ? "Этот email уже зарегистрирован. Переключись на вход." : "Не удалось создать аккаунт. Проверь данные.");
    else if (!data.session) setAuthMessage("Аккаунт создан. Подтверди email по ссылке в письме, затем войди.");
    else setAuthMessage("Заявка отправлена владельцу.");
    setAuthLoading(false);
  }

  async function approveAccess(request: AccessRequest) {
    if (!session || staffRole !== "owner") return;
    setTeamMessage("");
    const { error: insertError } = await supabase.from("staff_users").insert({ id: request.user_id, email: request.email, display_name: request.display_name, role: "manager", active: true });
    if (insertError && insertError.code !== "23505") {
      setTeamMessage("Не удалось добавить сотрудника.");
      return;
    }
    const { error: reviewError } = await supabase.from("staff_access_requests").update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: session.user.id }).eq("user_id", request.user_id);
    if (reviewError) setTeamMessage("Сотрудник добавлен, но статус заявки не обновился.");
    await loadDashboard();
  }

  async function rejectAccess(request: AccessRequest) {
    if (!session || staffRole !== "owner") return;
    setTeamMessage("");
    const { error: reviewError } = await supabase.from("staff_access_requests").update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: session.user.id }).eq("user_id", request.user_id);
    if (reviewError) setTeamMessage("Не удалось отклонить заявку.");
    else await loadDashboard();
  }

  async function toggleWorker(member: TeamMember) {
    if (staffRole !== "owner" || member.role === "owner") return;
    setTeamMessage("");
    const { error: updateError } = await supabase.from("staff_users").update({ active: !member.active }).eq("id", member.id);
    if (updateError) setTeamMessage("Не удалось изменить доступ сотрудника.");
    else await loadDashboard();
  }

  async function removeWorker(member: TeamMember) {
    if (staffRole !== "owner" || member.role !== "manager" || !window.confirm(`Удалить ${member.display_name} из команды?`)) return;
    setTeamMessage("");
    const { error: deleteError } = await supabase.from("staff_users").delete().eq("id", member.id);
    if (deleteError) setTeamMessage("Не удалось удалить менеджера.");
    else await loadDashboard();
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
      duration_minutes: Number(form.get(`${item.id}_duration`) ?? item.duration_minutes ?? 90),
      price_amounts: {
        sedan: Number(form.get(`${item.id}_amount_sedan`) ?? item.price_amounts?.sedan ?? 0),
        crossover: Number(form.get(`${item.id}_amount_crossover`) ?? item.price_amounts?.crossover ?? 0),
        van: Number(form.get(`${item.id}_amount_van`) ?? item.price_amounts?.van ?? 0),
      },
    }));
    const nextSettings: SiteSettings = {
      phone: String(form.get("phone") ?? "").trim(),
      address: String(form.get("address") ?? "").trim(),
      hours: String(form.get("hours") ?? "").trim(),
      telegram_url: String(form.get("telegram_url") ?? "").trim(),
      instagram_url: String(form.get("instagram_url") ?? "").trim(),
      whatsapp_url: String(form.get("whatsapp_url") ?? "").trim(),
      tiktok_url: String(form.get("tiktok_url") ?? "").trim(),
      google_maps_url: String(form.get("google_maps_url") ?? "").trim(),
      review_url: String(form.get("review_url") ?? "").trim(),
      opening_time: String(form.get("opening_time") ?? "10:00"),
      closing_time: String(form.get("closing_time") ?? "22:00"),
      bay_count: Number(form.get("bay_count") ?? 2),
      slot_interval_minutes: Number(form.get("slot_interval_minutes") ?? 30),
      services,
    };
    setSettingsSaving(true);
    setSettingsMessage("");
    const { error: updateError } = await supabase.from("site_settings").update({ ...nextSettings, updated_at: new Date().toISOString() }).eq("id", 1);
    if (updateError) setSettingsMessage("Не удалось сохранить настройки. Проверь все поля.");
    else {
      const serviceAmounts = Object.fromEntries(services.map(item => [item.id, item.price_amounts]));
      const priceUpdates = (["sedan", "crossover", "van"] as const).map(vehicleType => supabase
        .from("vehicle_models")
        .update({
          express_price: serviceAmounts.express?.[vehicleType] ?? 0,
          complex_price: serviceAmounts.complex?.[vehicleType] ?? 0,
          detailing_price: serviceAmounts.detailing?.[vehicleType] ?? 0,
          updated_at: new Date().toISOString(),
        })
        .eq("vehicle_type", vehicleType));
      const priceResults = await Promise.all(priceUpdates);
      if (priceResults.some(result => result.error)) {
        setSettingsMessage("Настройки сохранены, но не все цены моделей обновились.");
        setSettingsSaving(false);
        return;
      }
      setVehicleModels(items => items.map(vehicle => ({
        ...vehicle,
        express_price: serviceAmounts.express?.[vehicle.vehicle_type] ?? vehicle.express_price,
        complex_price: serviceAmounts.complex?.[vehicle.vehicle_type] ?? vehicle.complex_price,
        detailing_price: serviceAmounts.detailing?.[vehicle.vehicle_type] ?? vehicle.detailing_price,
      })));
      setSiteSettings(nextSettings);
      setSettingsOpen(false);
    }
    setSettingsSaving(false);
  }

  async function changeStatus(id: string, status: BookingStatus) {
    const changes: Record<string, string | null> = { status, updated_at: new Date().toISOString() };
    if (status === "confirmed") changes.confirmed_at = new Date().toISOString();
    if (status === "completed") changes.completed_by = session?.user.id ?? null;
    const { error: updateError } = await supabase.from("bookings").update(changes).eq("id", id);
    if (updateError) setError("Не удалось изменить статус.");
    else setBookings(items => items.map(item => item.id === id ? { ...item, ...changes } as Booking : item));
  }

  async function saveVehicleModel(vehicle: VehicleModel) {
    setVehicleMessage("");
    const { error: updateError } = await supabase.from("vehicle_models").update({ brand: vehicle.brand.trim(), model: vehicle.model.trim(), vehicle_type: vehicle.vehicle_type, express_price: Number(vehicle.express_price), complex_price: Number(vehicle.complex_price), detailing_price: Number(vehicle.detailing_price), active: vehicle.active, sort_order: Number(vehicle.sort_order), updated_at: new Date().toISOString() }).eq("id", vehicle.id);
    setVehicleMessage(updateError ? "Не удалось сохранить модель." : `${vehicle.brand} ${vehicle.model}: цены сохранены.`);
  }

  async function addVehicleModel() {
    const { data, error: insertError } = await supabase.from("vehicle_models").insert({ brand: "Новая марка", model: "Новая модель", vehicle_type: "sedan", express_price: 350, complex_price: 790, detailing_price: 2900, active: false, sort_order: 999 }).select("id,brand,model,vehicle_type,express_price,complex_price,detailing_price,active,sort_order").single();
    if (insertError) setVehicleMessage("Не удалось добавить модель.");
    else { setVehicleModels(items => [...items, data as VehicleModel]); setVehicleMessage("Модель добавлена — укажи данные и включи её."); }
  }

  async function deleteVehicleModel(vehicle: VehicleModel) {
    if (!window.confirm(`Удалить ${vehicle.brand} ${vehicle.model} из каталога?`)) return;
    const { error: deleteError } = await supabase.from("vehicle_models").delete().eq("id", vehicle.id);
    if (deleteError) setVehicleMessage("Не удалось удалить модель.");
    else setVehicleModels(items => items.filter(item => item.id !== vehicle.id));
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
      service: walkInService,
      vehicle_type: String(form.get("vehicleType")),
      booking_date: walkInDate,
      booking_time: walkInTime,
      customer_name: String(form.get("name")).trim(),
      phone,
      car: String(form.get("car")).trim(),
      license_plate: String(form.get("licensePlate")).trim().toUpperCase(),
      booking_source: "walk_in",
      created_by: session.user.id,
    }).select("id,service,vehicle_type,booking_date,booking_time,customer_name,phone,car,license_plate,booking_source,created_by,status,created_at,confirmed_at,whatsapp_sent_at,duration_minutes,price_amount,bay_number,customer_id,assigned_to,completed_by,rescheduled_at,cancelled_at,cancel_reason,review_sent_at,reminder_sent_at").single();

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
    const popup = window.open("about:blank", "_blank");
    const { error: updateError } = await supabase.from("bookings").update({ booking_date: rescheduleDate, booking_time: rescheduleTime, rescheduled_at: now, updated_at: now }).eq("id", reschedulingBooking.id);
    if (updateError) {
      popup?.close();
      setRescheduleMessage(updateError.code === "23505" ? "Это время уже занято — выбери другое." : "Не удалось перенести запись.");
    } else {
      setBookings(items => items.map(item => item.id === reschedulingBooking.id ? { ...item, booking_date: rescheduleDate, booking_time: `${rescheduleTime}:00` } : item).sort((a, b) => `${a.booking_date}${a.booking_time}`.localeCompare(`${b.booking_date}${b.booking_time}`)));
      const url = `https://wa.me/${whatsappPhone(reschedulingBooking.phone)}?text=${encodeURIComponent(rescheduledMessage(reschedulingBooking, rescheduleDate, rescheduleTime))}`;
      if (popup) popup.location.href = url;
      else window.location.href = url;
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
    const { error: updateError } = await supabase.from("bookings").update({ status: "completed", completed_by: session?.user.id ?? null, updated_at: now }).eq("id", booking.id);
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

  async function cancelInWhatsapp(booking: Booking) {
    const popup = window.open("about:blank", "_blank");
    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from("bookings").update({ status: "cancelled", cancelled_at: now, cancelled_by: session?.user.id ?? null, cancel_reason: "Отменено сотрудником", updated_at: now }).eq("id", booking.id);
    if (updateError) {
      popup?.close();
      setError("Не удалось отменить запись.");
      return;
    }
    setBookings(items => items.map(item => item.id === booking.id ? { ...item, status: "cancelled", cancelled_at: now } : item));
    const url = `https://wa.me/${whatsappPhone(booking.phone)}?text=${encodeURIComponent(cancelledMessage(booking))}`;
    if (popup) popup.location.href = url;
    else window.location.href = url;
  }

  async function requestReview(booking: Booking) {
    const popup = window.open("about:blank", "_blank");
    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from("bookings").update({ review_sent_at: now, updated_at: now }).eq("id", booking.id);
    if (updateError) {
      popup?.close();
      setError("Не удалось отметить запрос отзыва.");
      return;
    }
    setBookings(items => items.map(item => item.id === booking.id ? { ...item, review_sent_at: now } : item));
    const url = `https://wa.me/${whatsappPhone(booking.phone)}?text=${encodeURIComponent(reviewMessage(booking, siteSettings.review_url))}`;
    if (popup) popup.location.href = url;
    else window.location.href = url;
  }

  async function sendReminder(booking: Booking) {
    const popup = window.open("about:blank", "_blank");
    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from("bookings").update({ reminder_sent_at: now, updated_at: now }).eq("id", booking.id);
    if (updateError) {
      popup?.close();
      setError("Не удалось отметить напоминание.");
      return;
    }
    setBookings(items => items.map(item => item.id === booking.id ? { ...item, reminder_sent_at: now } : item));
    const url = `https://wa.me/${whatsappPhone(booking.phone)}?text=${encodeURIComponent(reminderMessage(booking))}`;
    if (popup) popup.location.href = url;
    else window.location.href = url;
  }

  async function deleteBooking(booking: Booking) {
    if (staffRole !== "owner" || !window.confirm(`Удалить запись ${booking.customer_name} без возможности восстановления?`)) return;
    const { error: deleteError } = await supabase.from("bookings").delete().eq("id", booking.id);
    if (deleteError) setError("Не удалось удалить запись.");
    else setBookings(items => items.filter(item => item.id !== booking.id));
  }

  async function saveCustomerNotes(customer: Customer, notes: string) {
    const { error: updateError } = await supabase.from("customers").update({ notes, updated_at: new Date().toISOString() }).eq("id", customer.id);
    if (updateError) setTeamMessage("Не удалось сохранить заметку клиента.");
    else setCustomers(items => items.map(item => item.id === customer.id ? { ...item, notes } : item));
  }

  async function redeemReward(customer: Customer) {
    if (!window.confirm(`Списать 5 баллов у ${customer.display_name}?`)) return;
    const { data, error: redeemError } = await supabase.rpc("redeem_customer_reward", { p_customer_id: customer.id });
    if (redeemError) setTeamMessage("Награда пока недоступна.");
    else setCustomers(items => items.map(item => item.id === customer.id ? { ...item, loyalty_points: Number(data) } : item));
  }

  async function deleteCustomer(customer: Customer) {
    if (staffRole !== "owner" || !window.confirm(`Удалить карточку клиента ${customer.display_name}? История записей останется.`)) return;
    const { error: deleteError } = await supabase.from("customers").delete().eq("id", customer.id);
    if (deleteError) setTeamMessage("Не удалось удалить клиента.");
    else setCustomers(items => items.filter(item => item.id !== customer.id));
  }

  async function addClosure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || staffRole !== "owner") return;
    const form = new FormData(event.currentTarget);
    const fullDay = form.get("fullDay") === "on";
    const { error: insertError } = await supabase.from("business_closures").insert({
      closure_date: String(form.get("date")),
      start_time: fullDay ? null : String(form.get("startTime")),
      end_time: fullDay ? null : String(form.get("endTime")),
      reason: String(form.get("reason")).trim(),
      created_by: session.user.id,
    });
    if (insertError) setSettingsMessage("Не удалось закрыть это время.");
    else {
      event.currentTarget.reset();
      await loadDashboard();
    }
  }

  async function removeClosure(closure: Closure) {
    if (staffRole !== "owner") return;
    const { error: deleteError } = await supabase.from("business_closures").delete().eq("id", closure.id);
    if (deleteError) setSettingsMessage("Не удалось удалить блокировку.");
    else await loadDashboard();
  }

  if (!authReady) return <main className="staffApp"><div className="staffLoader">Загрузка…</div></main>;

  if (!session) return <main className="staffApp loginScreen"><section className="loginCard">
    <div className="staffBrand"><img src="/mall-autowash-logo.png" alt="MALL AUTOWASH" /><span><small>Панель сотрудника</small></span></div>
    <h1>{authMode === "login" ? "Вход в рабочее приложение" : "Стать сотрудником"}</h1><p>{authMode === "login" ? "Введи рабочий email и пароль. После входа приложение запомнит тебя на этом устройстве." : "Создай аккаунт. Владелец увидит заявку и откроет доступ к рабочей панели."}</p>
    <div className="authTabs"><button className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setAuthMessage(""); }}>Вход</button><button className={authMode === "register" ? "active" : ""} onClick={() => { setAuthMode("register"); setAuthMessage(""); }}>Регистрация</button></div>
    <form onSubmit={authMode === "login" ? signIn : register}>
      {authMode === "register" && <><label htmlFor="staff-name">Имя сотрудника</label><input id="staff-name" value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Например, Андрей" minLength={2} maxLength={80} required /></>}
      <label htmlFor="staff-email">Рабочий email</label>
      <input id="staff-email" type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} placeholder="worker@example.com" required />
      <label htmlFor="staff-password">Пароль</label>
      <input id="staff-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Введите пароль" minLength={6} required />
      <button disabled={authLoading}>{authLoading ? "Подождите…" : authMode === "login" ? "Войти →" : "Отправить заявку →"}</button>
    </form>
    {authMode === "login" && <div className="authHelp"><button type="button" onClick={sendPasswordReset}>Забыли пароль?</button><button type="button" onClick={resendConfirmation}>Повторить письмо</button></div>}
    {authMessage && <div className="authMessage errorMessage" role="alert">{authMessage}</div>}
  </section></main>;

  if (session && passwordRecovery) return <main className="staffApp loginScreen"><section className="loginCard">
    <div className="staffBrand"><img src="/mall-autowash-logo.png" alt="MALL AUTOWASH" /><span><small>Безопасность</small></span></div>
    <h1>Создай новый пароль</h1><p>Придумай новый рабочий пароль минимум из восьми символов.</p>
    <form onSubmit={updateRecoveredPassword}><label>Новый пароль<input name="newPassword" type="password" minLength={8} autoComplete="new-password" required /></label><button>Сохранить пароль →</button></form>
    {authMessage && <div className="authMessage errorMessage">{authMessage}</div>}
  </section></main>;

  if (session && mfaRequired) return <main className="staffApp loginScreen"><section className="loginCard">
    <div className="staffBrand"><img src="/mall-autowash-logo.png" alt="MALL AUTOWASH" /><span><small>Двухфакторная защита</small></span></div>
    <h1>Подтверди вход</h1><p>Введи шестизначный код из приложения Authenticator.</p>
    <form onSubmit={verifyMfa}><label>Код Authenticator<input value={mfaCode} onChange={event => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" pattern="[0-9]{6}" required /></label><button>Подтвердить →</button></form>
    {mfaMessage && <div className="authMessage errorMessage">{mfaMessage}</div>}
  </section></main>;

  if (!staffName && !loading) return <main className="staffApp loginScreen"><section className="loginCard accessCard">
    <div className="accessIcon">!</div><h1>{requestStatus === "rejected" ? "Заявка отклонена" : "Доступ ожидает подтверждения"}</h1><p>{requestStatus === "rejected" ? <>Владелец пока не открыл доступ аккаунту <b>{session.user.email}</b>.</> : <>Заявка аккаунта <b>{session.user.email}</b> отправлена владельцу. После одобрения обнови страницу.</>}</p><button onClick={loadDashboard}>↻ Проверить доступ</button><button className="secondaryAccess" onClick={() => supabase.auth.signOut()}>Выйти</button>
  </section></main>;

  return <main className="staffApp">
    <header className="staffHeader"><div className="staffBrand"><img src="/mall-autowash-logo.png" alt="MALL AUTOWASH" /><span><small>{staffRole === "owner" ? "Панель владельца" : "Панель менеджера"}</small></span></div><div className="staffUser"><button className={liveAlerts ? "alertsOn" : ""} onClick={enableLiveAlerts}>{liveAlerts ? "🔔 Включены" : "🔕 Уведомления"}</button><span><b>{staffName}</b><small>{staffRole === "owner" ? "Владелец" : "Менеджер"} · {session.user.email}</small></span><button onClick={() => supabase.auth.signOut()}>Выйти</button></div></header>
    {toast && <div className="liveToast" role="status"><b>●</b>{toast}<button onClick={() => setToast("")}>×</button></div>}
    <section className="staffContent">
      <div className="staffTitle"><div><span>ЗАЯВКИ</span><h1>Записи клиентов</h1></div><div className="staffTitleActions">{staffRole === "owner" && <><button className="teamButton" onClick={() => { setTeamOpen(true); setTeamMessage(""); }}>👥 Команда{pendingRequests.length > 0 && <b>{pendingRequests.length}</b>}</button><button onClick={() => setCustomersOpen(true)}>◎ Клиенты</button><button onClick={() => setScheduleSettingsOpen(true)}>▦ График</button><button onClick={() => setAuditOpen(true)}>☷ Журнал</button><button onClick={() => setSecurityOpen(true)}>⌾ Защита</button><button onClick={() => { setVehiclesOpen(true); setVehicleMessage(""); }}>🚗 Автомобили</button><button className="ownerSettingsButton" onClick={() => { setSettingsOpen(true); setSettingsMessage(""); }}>⚙ Сайт</button></>}<button className="addWalkIn" onClick={() => { setWalkInOpen(current => !current); setWalkInMessage(""); }}>+ Клиент на месте</button><button onClick={loadDashboard} disabled={loading}>{loading ? "Обновляем…" : "↻ Обновить"}</button></div></div>
      <div className="staffStats"><button className={filter === "new" ? "active" : ""} onClick={() => setFilter("new")}><span>Новые</span><b>{counts.new}</b></button><button className={filter === "confirmed" ? "active" : ""} onClick={() => setFilter("confirmed")}><span>Подтверждены</span><b>{counts.confirmed}</b></button><button className={filter === "completed" ? "active" : ""} onClick={() => setFilter("completed")}><span>Выполнены</span><b>{counts.completed}</b></button><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}><span>Все</span><b>{counts.all}</b></button></div>
      {staffRole === "owner" && <section className="staffReport" aria-label="Отчёт по выполненным машинам"><div className="reportHead"><span>ОТЧЁТ ВЛАДЕЛЬЦА</span><h2>Результаты мойки</h2><small>Менеджеры этот блок не видят</small></div><div className="reportNumbers"><div><span>Сегодня</span><b>{report.today}</b><small>машин</small></div><div><span>7 дней</span><b>{report.week}</b><small>машин</small></div><div className="reportAccent"><span>Выручка</span><b>{report.revenue.toLocaleString("ru-RU")}</b><small>mdl за месяц</small></div><div><span>Загрузка</span><b>{report.load}%</b><small>за месяц</small></div><div><span>Хит</span><b className="reportWord">{serviceNames[report.popular]}</b><small>{report.month} выполнено</small></div></div></section>}
      <div className="staffSearch"><span>⌕</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Поиск по имени, телефону, машине или госномеру" aria-label="Поиск заявок" />{search && <button onClick={() => setSearch("")} aria-label="Очистить поиск">×</button>}</div>
      <div className="staffDays"><button className={selectedDate === "all" ? "active" : ""} onClick={() => setSelectedDate("all")}>Все дни</button>{dashboardDates.map(item => <button className={selectedDate === item.iso ? "active" : ""} onClick={() => setSelectedDate(item.iso)} key={item.iso}>{item.label}</button>)}</div>
      <section className="daySchedule" aria-label="Расписание выбранного дня"><div className="dayScheduleHead"><div><span>РАСПИСАНИЕ ДНЯ · {siteSettings.bay_count} БОКСА</span><h2>{new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${scheduleDate}T12:00:00`))}</h2></div><p><i /> занято <b /> свободно</p></div><div className="dayScheduleGrid">{scheduleSlots.map(slot => { const atSlot = scheduleBookings.filter(item => item.booking_time.slice(0, 5) === slot); return atSlot.length ? <article className={`scheduleSlot ${atSlot[0].status}`} key={slot}><time>{slot}</time>{atSlot.map(booking => <div className="slotBooking" key={booking.id}><strong>{booking.customer_name}</strong><span>Бокс {booking.bay_number} · {booking.car}</span><em>{booking.license_plate}</em></div>)}<small>{atSlot.length}/{siteSettings.bay_count} занято</small></article> : <button className="scheduleSlot free" onClick={() => openWalkInAt(slot)} key={slot}><time>{slot}</time><strong>Свободно</strong><span>+ Добавить клиента</span></button>; })}</div></section>
      {walkInOpen && <form className="walkInCard" onSubmit={createWalkIn}>
        <div className="walkInHead"><div><small>БЕЗ ПРЕДВАРИТЕЛЬНОЙ ЗАПИСИ</small><h2>Добавить клиента на месте</h2></div><button type="button" onClick={() => setWalkInOpen(false)} aria-label="Закрыть">×</button></div>
        <div className="walkInFields walkInThree"><label>Тип машины<select name="vehicleType" defaultValue="sedan"><option value="sedan">Седан</option><option value="crossover">Кроссовер</option><option value="van">Минивэн</option></select></label><label>Услуга<select value={walkInService} onChange={event => setWalkInService(event.target.value as Booking["service"])}>{siteSettings.services.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Дата<input type="date" value={walkInDate} min={localDate()} max={localDate(90)} onChange={event => setWalkInDate(event.target.value)} required /></label></div>
        <div className="walkInSlots">{walkInSlots.map(slot => { const occupied = slot.availableBays <= 0; return <button type="button" className={walkInTime === slot.time ? "active" : ""} disabled={occupied} onClick={() => setWalkInTime(slot.time)} key={slot.time}>{slot.time}<small>{occupied ? "занято" : `${slot.availableBays} мест`}</small></button>; })}</div>
        {!walkInTime && <p className="walkInMessage">На этот день свободных окон нет.</p>}
        <div className="walkInFields customer"><label>Имя клиента<input name="name" minLength={2} maxLength={80} placeholder="Например, Иван" required /></label><label>Телефон<input name="phone" type="tel" minLength={10} maxLength={20} placeholder="+373 ___ ___ ___" required /></label><label>Марка и модель<input name="car" minLength={2} maxLength={120} placeholder="BMW X5" required /></label><label>Госномер<input name="licensePlate" minLength={2} maxLength={20} autoCapitalize="characters" placeholder="ABC 123" required /></label></div>
        {walkInMessage && <p className="walkInMessage">{walkInMessage}</p>}
        <button className="saveWalkIn" disabled={walkInSaving || !walkInTime}>{walkInSaving ? "Добавляем…" : "Занять это время →"}</button>
      </form>}
      {error && <div className="staffError">{error}</div>}
      <div className="bookingList">{visible.length === 0 ? <div className="emptyState"><b>{search ? "⌕" : "✓"}</b><h2>{search ? "Ничего не найдено" : "Здесь пока пусто"}</h2><p>{search ? "Проверь имя, телефон или госномер." : "Новые записи появятся автоматически."}</p></div> : visible.map(booking => <article className="bookingItem" key={booking.id}>
        <div className="bookingWhen"><strong>{booking.booking_time.slice(0, 5)}</strong><span>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(`${booking.booking_date}T12:00:00`))}</span></div>
        <div className="bookingClient"><div className="statusLine"><i className={`statusDot ${booking.status}`} /><small>{statusNames[booking.status]}</small>{booking.booking_source === "walk_in" && <small className="walkInBadge">Клиент на месте</small>}<small className="bayBadge">Бокс {booking.bay_number ?? "—"}</small></div><h2>{booking.customer_name}</h2><p>{booking.car} · {vehicleNames[booking.vehicle_type]} · {serviceNames[booking.service]} · {booking.duration_minutes} мин</p><strong className="licensePlate">{booking.license_plate}</strong>{booking.phone && <a href={`tel:${booking.phone}`}>{booking.phone}</a>}{booking.customers && <span className="loyaltyBadge">◆ {booking.customers.loyalty_points} баллов · {booking.customers.visits} визитов</span>}</div>
        <div className="bookingActions">{booking.status === "new" && booking.booking_source === "online" && booking.phone && <button className="whatsapp" onClick={() => confirmInWhatsapp(booking)}>Подтвердить WhatsApp <b>↗</b></button>}{booking.status === "new" && booking.booking_source === "walk_in" && <button className="done" onClick={() => changeStatus(booking.id, "confirmed")}>✓ Принять в работу</button>}{booking.status === "confirmed" && booking.phone && !booking.reminder_sent_at && <button className="reminder" onClick={() => sendReminder(booking)}>⏰ Напомнить</button>}{booking.status === "confirmed" && <button className="ready" onClick={() => completeInWhatsapp(booking)}>Машина готова <b>↗</b></button>}{booking.status === "completed" && booking.phone && !booking.review_sent_at && <button className="review" onClick={() => requestReview(booking)}>★ Попросить отзыв</button>}{booking.status === "completed" && booking.review_sent_at && <button className="reviewSent" disabled>★ Отзыв запрошен</button>}{booking.status !== "cancelled" && booking.status !== "completed" && <button className="reschedule" onClick={() => openReschedule(booking)}>Перенести + WhatsApp</button>}{booking.status !== "cancelled" && booking.status !== "completed" && <button className="cancel" onClick={() => cancelInWhatsapp(booking)}>Отменить + WhatsApp</button>}{staffRole === "owner" && <button className="deleteBooking" onClick={() => deleteBooking(booking)}>Удалить</button>}</div>
      </article>)}</div>
    </section>
    {reschedulingBooking && <div className="rescheduleOverlay" role="dialog" aria-modal="true" aria-labelledby="reschedule-title"><form className="rescheduleCard" onSubmit={saveReschedule}>
      <div className="walkInHead"><div><small>ИЗМЕНЕНИЕ ЗАПИСИ</small><h2 id="reschedule-title">Перенести {reschedulingBooking.customer_name}</h2><p>{reschedulingBooking.car} · {reschedulingBooking.license_plate}</p></div><button type="button" onClick={() => setReschedulingId(null)} aria-label="Закрыть">×</button></div>
      <label className="rescheduleDate">Новая дата<input type="date" value={rescheduleDate} min={localDate()} max={localDate(90)} onChange={event => setRescheduleDate(event.target.value)} required /></label>
      <div className="walkInSlots">{rescheduleSlots.map(slot => { const occupied = slot.availableBays <= 0 && slot.time !== reschedulingBooking.booking_time.slice(0, 5); return <button type="button" className={rescheduleTime === slot.time ? "active" : ""} disabled={occupied} onClick={() => setRescheduleTime(slot.time)} key={slot.time}>{slot.time}<small>{occupied ? "занято" : `${slot.availableBays} мест`}</small></button>; })}</div>
      {!rescheduleTime && <p className="walkInMessage">На этот день свободных окон нет.</p>}
      {rescheduleMessage && <p className="walkInMessage">{rescheduleMessage}</p>}
      <button className="saveWalkIn" disabled={rescheduleSaving || !rescheduleTime}>{rescheduleSaving ? "Переносим…" : "Сохранить и открыть WhatsApp →"}</button>
    </form></div>}
    {teamOpen && staffRole === "owner" && <div className="rescheduleOverlay" role="dialog" aria-modal="true" aria-labelledby="team-title"><section className="rescheduleCard teamCard">
      <div className="walkInHead"><div><small>ТОЛЬКО ДЛЯ ВЛАДЕЛЬЦА</small><h2 id="team-title">Сотрудники</h2><p>Одобряй новые аккаунты и временно отключай доступ работникам.</p></div><button type="button" onClick={() => setTeamOpen(false)} aria-label="Закрыть">×</button></div>
      <div className="teamSection"><div className="teamSectionHead"><h3>Заявки на доступ</h3><b>{pendingRequests.length}</b></div>{pendingRequests.length === 0 ? <p className="teamEmpty">Новых заявок пока нет.</p> : pendingRequests.map(request => <article className="teamRow requestRow" key={request.user_id}><div><strong>{request.display_name}</strong><span>{request.email}</span><small>{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(request.created_at))}</small></div><div><button className="approveWorker" onClick={() => approveAccess(request)}>✓ Одобрить</button><button className="rejectWorker" onClick={() => rejectAccess(request)}>Отклонить</button></div></article>)}</div>
      <div className="teamSection"><div className="teamSectionHead"><h3>Команда и результат</h3><b>{teamMembers.length}</b></div>{teamMembers.map(member => <article className="teamRow" key={member.id}><div><strong>{member.display_name}<em>{member.role === "owner" ? "Владелец" : "Менеджер"}</em></strong><span>{member.email}</span><small>{member.active ? "Доступ активен" : "Доступ отключён"} · завершено {bookings.filter(booking => booking.completed_by === member.id).length}</small></div>{member.role === "manager" && <div><button className={member.active ? "disableWorker" : "enableWorker"} onClick={() => toggleWorker(member)}>{member.active ? "Отключить" : "Включить доступ"}</button><button className="removeWorker" onClick={() => removeWorker(member)}>Удалить</button></div>}</article>)}</div>
      {teamMessage && <p className="walkInMessage">{teamMessage}</p>}
    </section></div>}
    {customersOpen && staffRole === "owner" && <div className="rescheduleOverlay" role="dialog" aria-modal="true" aria-labelledby="customers-title"><section className="rescheduleCard customersCard">
      <div className="walkInHead"><div><small>CRM КЛИЕНТОВ</small><h2 id="customers-title">Клиенты и лояльность</h2><p>История посещений, накопленные баллы и рабочие заметки.</p></div><button type="button" onClick={() => setCustomersOpen(false)} aria-label="Закрыть">×</button></div>
      <div className="customerList">{customers.length === 0 ? <p className="teamEmpty">Клиенты появятся после первой записи.</p> : customers.map(customer => <article className="customerRow" key={customer.id}><div className="customerIdentity"><strong>{customer.display_name}</strong><span>{customer.phone}</span><em>{customer.last_car} · {customer.last_license_plate}</em></div><div className="customerMetrics"><b>{customer.visits}<small>визитов</small></b><b>{customer.loyalty_points}<small>баллов</small></b><b>{Number(customer.total_spent).toLocaleString("ru-RU")}<small>mdl</small></b></div><label>Заметка<textarea defaultValue={customer.notes} placeholder="Предпочтения клиента…" onBlur={event => saveCustomerNotes(customer, event.target.value)} /></label><div className="customerActions">{customer.loyalty_points >= 5 && <button onClick={() => redeemReward(customer)}>Использовать подарок</button>}<button onClick={() => deleteCustomer(customer)}>Удалить</button></div>{customer.loyalty_points >= 5 && <span className="rewardReady">ПОДАРОК ГОТОВ</span>}</article>)}</div>
    </section></div>}
    {scheduleSettingsOpen && staffRole === "owner" && <div className="rescheduleOverlay" role="dialog" aria-modal="true" aria-labelledby="closures-title"><section className="rescheduleCard teamCard">
      <div className="walkInHead"><div><small>УПРАВЛЕНИЕ ГРАФИКОМ</small><h2 id="closures-title">Выходные и перерывы</h2><p>Закрой целый день или отдельный промежуток — клиентам он сразу станет недоступен.</p></div><button type="button" onClick={() => setScheduleSettingsOpen(false)} aria-label="Закрыть">×</button></div>
      <form className="closureForm" onSubmit={addClosure}><label>Дата<input name="date" type="date" min={localDate()} max={localDate(365)} required /></label><label>С<input name="startTime" type="time" defaultValue="13:00" /></label><label>До<input name="endTime" type="time" defaultValue="14:00" /></label><label>Причина<input name="reason" minLength={2} maxLength={160} placeholder="Технический перерыв" required /></label><label className="fullDayCheck"><input name="fullDay" type="checkbox" /> Весь день</label><button>Закрыть время →</button></form>
      <div className="closureList">{closures.length === 0 ? <p className="teamEmpty">Будущих блокировок нет.</p> : closures.map(closure => <article key={closure.id}><div><strong>{closure.closure_date}</strong><span>{closure.start_time ? `${closure.start_time.slice(0, 5)}–${closure.end_time?.slice(0, 5)}` : "Весь день"}</span><small>{closure.reason}</small></div><button onClick={() => removeClosure(closure)}>Открыть обратно</button></article>)}</div>
      {settingsMessage && <p className="walkInMessage">{settingsMessage}</p>}
    </section></div>}
    {auditOpen && staffRole === "owner" && <div className="rescheduleOverlay" role="dialog" aria-modal="true" aria-labelledby="audit-title"><section className="rescheduleCard teamCard">
      <div className="walkInHead"><div><small>БЕЗОПАСНОСТЬ</small><h2 id="audit-title">Журнал действий</h2><p>Последние изменения записей сотрудниками.</p></div><button type="button" onClick={() => setAuditOpen(false)} aria-label="Закрыть">×</button></div>
      <div className="auditList">{auditLogs.length === 0 ? <p className="teamEmpty">Действий пока нет.</p> : auditLogs.map(log => <article key={log.id}><time>{new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(log.created_at))}</time><div><strong>{log.action === "insert" ? "Создана запись" : log.action === "delete" ? "Удалена запись" : "Изменена запись"}</strong><span>{String(log.details.customer ?? "Клиент")} · {String(log.details.date ?? "")} {String(log.details.time ?? "").slice(0, 5)}</span></div></article>)}</div>
    </section></div>}
    {securityOpen && staffRole === "owner" && <div className="rescheduleOverlay" role="dialog" aria-modal="true" aria-labelledby="security-title"><section className="rescheduleCard securityCard">
      <div className="walkInHead"><div><small>ЗАЩИТА ВЛАДЕЛЬЦА</small><h2 id="security-title">Двухфакторный вход</h2><p>Подключи Google Authenticator, Microsoft Authenticator или 1Password.</p></div><button type="button" onClick={() => setSecurityOpen(false)} aria-label="Закрыть">×</button></div>
      {!mfaQr ? <button className="saveWalkIn" onClick={startMfaEnrollment}>Создать QR-код защиты →</button> : <div className="mfaEnroll"><img src={mfaQr} alt="QR-код для Authenticator" /><label>Код из приложения<input value={mfaCode} onChange={event => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" /></label><button onClick={finishMfaEnrollment}>Включить 2FA →</button></div>}
      {mfaMessage && <p className="securityMessage">{mfaMessage}</p>}
    </section></div>}
    {vehiclesOpen && staffRole === "owner" && <div className="rescheduleOverlay" role="dialog" aria-modal="true" aria-labelledby="vehicles-title"><section className="rescheduleCard vehicleCatalogCard">
      <div className="walkInHead"><div><small>ТОЛЬКО ДЛЯ ВЛАДЕЛЬЦА</small><h2 id="vehicles-title">Автомобили и цены</h2><p>Цена каждой услуги задаётся отдельно для конкретной модели. Выключенная модель не показывается клиентам.</p></div><button type="button" onClick={() => setVehiclesOpen(false)} aria-label="Закрыть">×</button></div>
      <div className="vehicleCatalogActions"><b>{vehicleModels.length} моделей</b><button onClick={addVehicleModel}>+ Добавить модель</button></div>
      <div className="vehicleCatalogList">{vehicleModels.map((vehicle, index) => <article className={!vehicle.active ? "inactive" : ""} key={vehicle.id}>
        <input aria-label="Марка" value={vehicle.brand} onChange={event => setVehicleModels(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, brand: event.target.value } : item))} />
        <input aria-label="Модель" value={vehicle.model} onChange={event => setVehicleModels(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, model: event.target.value } : item))} />
        <select aria-label="Тип кузова" value={vehicle.vehicle_type} onChange={event => setVehicleModels(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, vehicle_type: event.target.value as Booking["vehicle_type"] } : item))}><option value="sedan">Седан</option><option value="crossover">Кроссовер</option><option value="van">Минивэн</option></select>
        {(["express_price", "complex_price", "detailing_price"] as const).map((field, priceIndex) => <label key={field}><span>{["Экспресс", "Комплекс", "Детейлинг"][priceIndex]}</span><input type="number" min="0" value={vehicle[field]} onChange={event => setVehicleModels(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: Number(event.target.value) } : item))} /></label>)}
        <label className="vehicleActive"><input type="checkbox" checked={vehicle.active} onChange={event => setVehicleModels(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, active: event.target.checked } : item))} /> На сайте</label>
        <div><button className="vehicleSave" onClick={() => saveVehicleModel(vehicle)}>Сохранить</button><button className="vehicleDelete" onClick={() => deleteVehicleModel(vehicle)}>Удалить</button></div>
      </article>)}</div>
      {vehicleMessage && <p className="vehicleMessage">{vehicleMessage}</p>}
    </section></div>}
    {settingsOpen && staffRole === "owner" && <div className="rescheduleOverlay" role="dialog" aria-modal="true" aria-labelledby="settings-title"><form className="rescheduleCard settingsCard" onSubmit={saveSettings}>
      <div className="walkInHead"><div><small>ТОЛЬКО ДЛЯ ВЛАДЕЛЬЦА</small><h2 id="settings-title">Настройки сайта</h2><p>После сохранения данные сразу обновятся на сайте клиентов.</p></div><button type="button" onClick={() => setSettingsOpen(false)} aria-label="Закрыть">×</button></div>
      <div className="settingsGrid"><label>Телефон<input name="phone" type="tel" minLength={5} maxLength={30} defaultValue={siteSettings.phone} required /></label><label>Адрес<input name="address" minLength={3} maxLength={160} defaultValue={siteSettings.address} required /></label><label>Текст графика<input name="hours" minLength={3} maxLength={80} defaultValue={siteSettings.hours} required /></label><label>Google Maps<input name="google_maps_url" type="url" minLength={8} maxLength={500} defaultValue={siteSettings.google_maps_url} required /></label><label>Ссылка для отзывов<input name="review_url" type="url" minLength={8} maxLength={500} defaultValue={siteSettings.review_url} required /></label><label>Открытие<input name="opening_time" type="time" defaultValue={siteSettings.opening_time.slice(0, 5)} required /></label><label>Закрытие<input name="closing_time" type="time" defaultValue={siteSettings.closing_time.slice(0, 5)} required /></label><label>Количество боксов<input name="bay_count" type="number" min="1" max="10" defaultValue={siteSettings.bay_count} required /></label><label>Шаг записи<input name="slot_interval_minutes" type="number" min="15" max="90" step="15" defaultValue={siteSettings.slot_interval_minutes} required /></label><label>Telegram<input name="telegram_url" type="url" minLength={8} maxLength={300} defaultValue={siteSettings.telegram_url} required /></label><label>Instagram<input name="instagram_url" type="url" minLength={8} maxLength={300} defaultValue={siteSettings.instagram_url} required /></label><label>WhatsApp<input name="whatsapp_url" type="url" minLength={8} maxLength={300} defaultValue={siteSettings.whatsapp_url} required /></label><label>TikTok<input name="tiktok_url" type="url" minLength={8} maxLength={300} defaultValue={siteSettings.tiktok_url} required /></label></div>
      <div className="serviceSettings"><small>УСЛУГИ, ЦЕНЫ И ДЛИТЕЛЬНОСТЬ</small>{siteSettings.services.map((item, index) => <fieldset key={item.id}><legend>0{index + 1}</legend><label>Название<input name={`${item.id}_name`} minLength={1} maxLength={50} defaultValue={item.name} required /></label><label>Описание<input name={`${item.id}_note`} minLength={1} maxLength={120} defaultValue={item.note} required /></label><label>Седан, текст<input name={`${item.id}_price_sedan`} minLength={1} maxLength={40} defaultValue={item.prices.sedan} required /></label><label>Седан, MDL<input name={`${item.id}_amount_sedan`} type="number" min="0" defaultValue={item.price_amounts?.sedan ?? 0} required /></label><label>Кроссовер, текст<input name={`${item.id}_price_crossover`} minLength={1} maxLength={40} defaultValue={item.prices.crossover} required /></label><label>Кроссовер, MDL<input name={`${item.id}_amount_crossover`} type="number" min="0" defaultValue={item.price_amounts?.crossover ?? 0} required /></label><label>Минивэн, текст<input name={`${item.id}_price_van`} minLength={1} maxLength={40} defaultValue={item.prices.van} required /></label><label>Минивэн, MDL<input name={`${item.id}_amount_van`} type="number" min="0" defaultValue={item.price_amounts?.van ?? 0} required /></label><label>Текст времени<input name={`${item.id}_time`} minLength={1} maxLength={40} defaultValue={item.time} required /></label><label>Минуты<input name={`${item.id}_duration`} type="number" min="15" max="480" step="15" defaultValue={item.duration_minutes ?? 90} required /></label></fieldset>)}</div>
      {settingsMessage && <p className="walkInMessage">{settingsMessage}</p>}
      <button className="saveWalkIn" disabled={settingsSaving}>{settingsSaving ? "Сохраняем…" : "Сохранить и обновить сайт →"}</button>
    </form></div>}
  </main>;
}
