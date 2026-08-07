"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Locale = "ro" | "ru" | "en";
type VehicleType = "sedan" | "crossover" | "van";
type ServiceConfig = { id: "express" | "complex" | "detailing"; name: string; note: string; prices: Record<VehicleType, string>; time: string };
type SiteSettings = { phone: string; address: string; hours: string; telegramUrl: string; instagramUrl: string; whatsappUrl: string; tiktokUrl: string; googleMapsUrl: string; services: ServiceConfig[] };

const defaultSettings: SiteSettings = {
  phone: "+7 999 123-45-67",
  address: "ул. Автомобильная, 12",
  hours: "Ежедневно 10:00–22:00",
  telegramUrl: "https://t.me/",
  instagramUrl: "https://www.instagram.com/",
  whatsappUrl: "https://wa.me/37368210010",
  tiktokUrl: "https://www.tiktok.com/",
  googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=BALTI+EVIMALL",
  services: [
    { id: "express", name: "Экспресс", note: "Кузов · диски · сушка", prices: { sedan: "350 ₽", crossover: "450 ₽", van: "550 ₽" }, time: "25 мин" },
    { id: "complex", name: "Комплекс", note: "Кузов · салон · стёкла", prices: { sedan: "790 ₽", crossover: "950 ₽", van: "1 150 ₽" }, time: "55 мин" },
    { id: "detailing", name: "Детейлинг", note: "Глубокая чистка и защита", prices: { sedan: "от 2 900 ₽", crossover: "от 3 500 ₽", van: "от 4 200 ₽" }, time: "2–3 часа" },
  ],
};

const serviceVisuals: Record<ServiceConfig["id"], { icon: string; popular: boolean }> = { express: { icon: "↗", popular: false }, complex: { icon: "✦", popular: true }, detailing: { icon: "◇", popular: false } };
const vehicleLabels: Record<Locale, Record<VehicleType, string>> = {
  ru: { sedan: "Седан", crossover: "Кроссовер", van: "Минивэн" },
  ro: { sedan: "Sedan", crossover: "Crossover", van: "Minivan" },
  en: { sedan: "Sedan", crossover: "Crossover", van: "Minivan" },
};
const serviceTranslations: Record<Exclude<Locale, "ru">, Record<ServiceConfig["id"], { name: string; note: string; time: string }>> = {
  ro: { express: { name: "Express", note: "Caroserie · jante · uscare", time: "25 min" }, complex: { name: "Complex", note: "Caroserie · salon · geamuri", time: "55 min" }, detailing: { name: "Detailing", note: "Curățare profundă și protecție", time: "2–3 ore" } },
  en: { express: { name: "Express", note: "Body · wheels · drying", time: "25 min" }, complex: { name: "Complete", note: "Body · interior · windows", time: "55 min" }, detailing: { name: "Detailing", note: "Deep cleaning and protection", time: "2–3 hours" } },
};
const copy = {
  ru: { services: "Услуги", booking: "Запись", contacts: "Контакты", eyebrow: "Автомойка нового поколения", hero: <>ЧИСТОТА,<br />КОТОРУЮ <em>ВИДНО.</em></>, heroText: "Бережная мойка, профессиональная химия и внимание к каждой детали. Пока мы занимаемся машиной — ты отдыхаешь.", book: "Записаться онлайн", schedule: "График работы", serviceKicker: "01 / УСЛУГИ", serviceTitle: <>Выбери свой<br />уровень чистоты</>, serviceText: <>Честные цены без доплат на месте.<br />Всё необходимое уже включено.</>, bookingKicker: "02 / ОНЛАЙН-ЗАПИСЬ", bookingTitle: <>ТВОЯ МАШИНА.<br /><em>ТВОЁ ВРЕМЯ.</em></>, bookingText: "Выбери удобное окно — мы подготовим бокс и будем ждать тебя без очереди.", chooseCar: "Какой кузов?", chooseService: "Что моем?", when: "Когда удобно?", contact: "Как с тобой связаться?", name: "Твоё имя", phone: "+373 ___ ___ ___", car: "Марка и модель авто", plate: "Госномер авто, например ABC 123", submit: "Подтвердить запись →", loading: "Создаём запись…", checking: "Проверяем время…", occupied: "занято", noSlots: "На этот день всё занято — выбери другую дату.", success: "Запись создана!", again: "Создать ещё запись", address: "АДРЕС", reach: "СВЯЗАТЬСЯ", slogan: "Чистота без компромиссов." },
  ro: { services: "Servicii", booking: "Programare", contacts: "Contacte", eyebrow: "Spălătorie auto de nouă generație", hero: <>CURĂȚENIE<br />CARE SE <em>VEDE.</em></>, heroText: "Spălare delicată, produse profesionale și atenție la fiecare detaliu. Noi avem grijă de mașină, tu te relaxezi.", book: "Programează-te online", schedule: "Program de lucru", serviceKicker: "01 / SERVICII", serviceTitle: <>Alege nivelul<br />tău de curățenie</>, serviceText: <>Prețuri corecte, fără costuri ascunse.<br />Tot ce ai nevoie este inclus.</>, bookingKicker: "02 / PROGRAMARE ONLINE", bookingTitle: <>MAȘINA TA.<br /><em>TIMPUL TĂU.</em></>, bookingText: "Alege ora potrivită — pregătim boxa și te așteptăm fără rând.", chooseCar: "Tipul mașinii", chooseService: "Ce spălăm?", when: "Când îți convine?", contact: "Cum te contactăm?", name: "Numele tău", phone: "+373 ___ ___ ___", car: "Marca și modelul", plate: "Numărul auto, ex. ABC 123", submit: "Confirmă programarea →", loading: "Creăm programarea…", checking: "Verificăm ora…", occupied: "ocupat", noSlots: "Toate orele sunt ocupate — alege altă zi.", success: "Programare creată!", again: "O nouă programare", address: "ADRESĂ", reach: "CONTACT", slogan: "Curățenie fără compromisuri." },
  en: { services: "Services", booking: "Booking", contacts: "Contacts", eyebrow: "A new generation car wash", hero: <>CLEANLINESS<br />YOU CAN <em>SEE.</em></>, heroText: "Gentle washing, professional products and attention to every detail. We take care of your car while you relax.", book: "Book online", schedule: "Opening hours", serviceKicker: "01 / SERVICES", serviceTitle: <>Choose your<br />level of clean</>, serviceText: <>Honest prices with no surprise charges.<br />Everything you need is included.</>, bookingKicker: "02 / ONLINE BOOKING", bookingTitle: <>YOUR CAR.<br /><em>YOUR TIME.</em></>, bookingText: "Choose a convenient slot — we will prepare the bay and welcome you without a queue.", chooseCar: "Vehicle type", chooseService: "What are we washing?", when: "When works for you?", contact: "How can we reach you?", name: "Your name", phone: "+373 ___ ___ ___", car: "Car make and model", plate: "License plate, e.g. ABC 123", submit: "Confirm booking →", loading: "Creating booking…", checking: "Checking time…", occupied: "busy", noSlots: "This day is fully booked — choose another date.", success: "Booking created!", again: "Create another booking", address: "ADDRESS", reach: "CONTACT", slogan: "Cleanliness without compromise." },
};

const slots = ["10:00", "11:30", "13:00", "14:30", "16:00", "17:30", "19:00", "20:30"];

function nextDates(locale: Locale) {
  const formatter = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : locale === "ro" ? "ro-RO" : "en-US", { weekday: "short" });
  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    const iso = date.toISOString().slice(0, 10);
    return { iso, day: formatter.format(date).replace(".", ""), number: date.getDate() };
  });
}

export default function Home() {
  const [locale, setLocale] = useState<Locale>("ru");
  const dates = useMemo(() => nextDates(locale), [locale]);
  const [settings, setSettings] = useState(defaultSettings);
  const [vehicleType, setVehicleType] = useState<VehicleType>("sedan");
  const [service, setService] = useState("complex");
  const [date, setDate] = useState(dates[0].iso);
  const [time, setTime] = useState("12:00");
  const [occupiedSlots, setOccupiedSlots] = useState<string[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const text = copy[locale];
  const displayedHours = settings.hours === defaultSettings.hours ? ({ ru: settings.hours, ro: "Zilnic 10:00–22:00", en: "Daily 10:00–22:00" } as const)[locale] : settings.hours;
  const tickerText = locale === "ru" ? "БЕЗОПАСНАЯ ХИМИЯ ✦ БЕЗ РАЗВОДОВ ✦ ГАРАНТИЯ КАЧЕСТВА ✦ ЗАПИСЬ ЗА 30 СЕКУНД ✦" : locale === "ro" ? "PRODUSE SIGURE ✦ FĂRĂ URME ✦ GARANȚIA CALITĂȚII ✦ PROGRAMARE ÎN 30 DE SECUNDE ✦" : "SAFE PRODUCTS ✦ STREAK-FREE ✦ QUALITY GUARANTEE ✦ BOOK IN 30 SECONDS ✦";
  const displayedAddress = settings.address === defaultSettings.address ? ({ ru: settings.address, ro: "str. Automobilului, 12", en: "12 Automobile Street" } as const)[locale] : settings.address;
  const services = useMemo(() => settings.services.map(item => ({
    ...item,
    ...(locale === "ru" ? {} : serviceTranslations[locale][item.id]),
    price: item.prices[vehicleType],
    ...serviceVisuals[item.id],
  })), [settings.services, locale, vehicleType]);
  const phoneHref = `tel:${settings.phone.replace(/[^\d+]/g, "")}`;

  useEffect(() => {
    let active = true;
    fetch("/api/settings", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("settings");
        return response.json() as Promise<SiteSettings>;
      })
      .then(data => { if (active) setSettings(data); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setAvailabilityLoading(true);
    fetch(`/api/bookings?date=${encodeURIComponent(date)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("availability");
        return response.json() as Promise<{ occupied: string[] }>;
      })
      .then(({ occupied }) => {
        if (!active) return;
        setOccupiedSlots(occupied);
        setTime((current) => occupied.includes(current) ? (slots.find((slot) => !occupied.includes(slot)) ?? "") : current);
      })
      .catch(() => {
        if (active) setOccupiedSlots([]);
      })
      .finally(() => {
        if (active) setAvailabilityLoading(false);
      });
    return () => { active = false; };
  }, [date]);

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    const form = new FormData(event.currentTarget);
    const payload = { service, vehicleType, date, time, name: form.get("name"), phone: form.get("phone"), car: form.get("car"), licensePlate: form.get("licensePlate") };
    try {
      const response = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось создать запись");
      setOccupiedSlots((current) => current.includes(time) ? current : [...current, time]);
      setStatus("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Попробуйте ещё раз");
      setStatus("error");
    }
  }

  return (
    <main>
      <nav className="nav shell">
        <a className="brand" href="#top"><img src="/mall-autowash-logo.png" alt="MALL AUTOWASH" /></a>
        <div className="navlinks"><a href="#services">{text.services}</a><a href="#booking">{text.booking}</a><a href="#contacts">{text.contacts}</a></div>
        <div className="navRight"><div className="languageSwitch" aria-label="Language">{(["ro", "ru", "en"] as Locale[]).map(item => <button className={locale === item ? "active" : ""} onClick={() => setLocale(item)} key={item}>{item.toUpperCase()}</button>)}</div><a className="navphone" href={phoneHref}>{settings.phone}</a></div>
      </nav>

      <section className="hero shell" id="top">
        <div className="heroCopy">
          <div className="eyebrow"><i /> {text.eyebrow}</div>
          <h1>{text.hero}</h1>
          <p>{text.heroText}</p>
          <div className="heroActions"><a className="primary" href="#booking">{text.book} <b>↗</b></a><a className="mapRating" href={settings.googleMapsUrl} target="_blank" rel="noreferrer">★ 4.9 <small>Google Maps ↗</small></a></div>
        </div>
        <div className="heroVisual" aria-label="Автомобиль MALL AUTO WASH">
          <div className="heroTag">MALL / AUTO CARE</div><div className="glow" /><img className="heroCar" src="/vehicle-sedan.png" alt="Современный седан" />
          <div className="stat"><strong>450+</strong><span>{locale === "ru" ? "чистых автомобилей" : locale === "ro" ? "mașini curate" : "clean cars"}</span></div>
          <div className="open"><i /> {text.schedule}<br /><b>{displayedHours}</b></div>
        </div>
      </section>

      <div className="ticker" aria-label={tickerText}>
        <div className="tickerTrack" aria-hidden="true">
          <span>{tickerText}</span><span>{tickerText}</span><span>{tickerText}</span><span>{tickerText}</span>
        </div>
      </div>

      <section className="section shell" id="services">
        <div className="sectionHead"><div><span>{text.serviceKicker}</span><h2>{text.serviceTitle}</h2></div><p>{text.serviceText}</p></div>
        <div className="serviceGrid">
          {services.map((item, index) => <article className={item.popular ? "serviceCard featured" : "serviceCard"} key={item.id}>
            {item.popular && <label>{locale === "ru" ? "ХИТ" : locale === "ro" ? "POPULAR" : "POPULAR"}</label>}<div className="serviceTop"><span>0{index + 1}</span><b>{item.icon}</b></div><h3>{item.name}</h3><p>{item.note}</p><div className="serviceBottom"><strong>{item.price}</strong><span>{item.time}</span></div>
          </article>)}
        </div>
      </section>

      <section className="bookingSection" id="booking">
        <div className="shell bookingGrid">
          <div className="bookingIntro"><span>{text.bookingKicker}</span><h2>{text.bookingTitle}</h2><p>{text.bookingText}</p><div className="steps"><b>1</b><i /><b>2</b><i /><b>3</b></div></div>
          <form className="bookingCard" onSubmit={submitBooking}>
            {status === "success" ? <div className="success"><div>✓</div><h3>{text.success}</h3><p>{date} · {time} · {vehicleLabels[locale][vehicleType]}</p><button type="button" onClick={() => setStatus("idle")}>{text.again}</button></div> : <>
              <div className="formStep"><span>01</span><div><h3>{text.chooseCar}</h3><div className="vehicleRow">{(["sedan", "crossover", "van"] as VehicleType[]).map(item => <button type="button" className={vehicleType === item ? "active" : ""} onClick={() => setVehicleType(item)} key={item}><span className="vehicleIcon" aria-hidden="true"><img src={`/vehicle-${item}.png`} alt="" /></span><small>{vehicleLabels[locale][item]}</small></button>)}</div><h3 className="serviceQuestion">{text.chooseService}</h3><div className="choiceRow">{services.map(item => <button type="button" className={service === item.id ? "active" : ""} onClick={() => setService(item.id)} key={item.id}>{item.name}<small>{item.price}</small></button>)}</div></div></div>
              <div className="formStep"><span>02</span><div><h3>{text.when}</h3><div className="dateRow">{dates.map(item => <button type="button" className={date === item.iso ? "active" : ""} onClick={() => setDate(item.iso)} key={item.iso}><small>{item.day}</small>{item.number}</button>)}</div><div className="slotRow">{slots.map(slot => { const occupied = occupiedSlots.includes(slot); return <button type="button" className={time === slot ? "active" : occupied ? "occupied" : ""} onClick={() => setTime(slot)} disabled={occupied || availabilityLoading} key={slot}>{slot}{occupied && <small>{text.occupied}</small>}</button>; })}</div>{!availabilityLoading && !time && <p className="noSlots">{text.noSlots}</p>}</div></div>
              <div className="formStep"><span>03</span><div><h3>{text.contact}</h3><div className="fields"><input name="name" aria-label="Name" placeholder={text.name} required /><input name="phone" aria-label="Phone" type="tel" placeholder={text.phone} required /><input name="car" aria-label="Car" placeholder={text.car} required /><input name="licensePlate" aria-label="License plate" placeholder={text.plate} autoCapitalize="characters" minLength={2} maxLength={20} required /></div><button className="submit" disabled={status === "loading" || availabilityLoading || !time}>{status === "loading" ? text.loading : availabilityLoading ? text.checking : text.submit}</button>{status === "error" && <p className="error">{message}</p>}</div></div>
            </>}
          </form>
        </div>
      </section>

      <footer id="contacts"><div className="shell footerGrid"><div><a className="brand" href="#top"><img src="/mall-autowash-logo.png" alt="MALL AUTOWASH" /></a><p>{text.slogan}</p></div><div><small>{text.address}</small><p>{displayedAddress}<br />{displayedHours}</p><a className="mapsLink" href={settings.googleMapsUrl} target="_blank" rel="noreferrer">Google Maps ↗</a></div><div><small>{text.reach}</small><a href={phoneHref}>{settings.phone}</a><div className="socialLinks"><a href={settings.telegramUrl} target="_blank" rel="noreferrer">Telegram ↗</a><a href={settings.whatsappUrl} target="_blank" rel="noreferrer">WhatsApp ↗</a><a href={settings.instagramUrl} target="_blank" rel="noreferrer">Instagram ↗</a><a href={settings.tiktokUrl} target="_blank" rel="noreferrer">TikTok ↗</a></div></div></div><div className="shell copyright">© 2026 MALL AUTO WASH</div></footer>
    </main>
  );
}
