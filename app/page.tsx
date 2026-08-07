"use client";

import { FormEvent, useMemo, useState } from "react";

const services = [
  { id: "express", name: "Экспресс", note: "Кузов · диски · сушка", price: "350 ₽", time: "25 мин", icon: "↗" },
  { id: "complex", name: "Комплекс", note: "Кузов · салон · стёкла", price: "790 ₽", time: "55 мин", icon: "✦", popular: true },
  { id: "detailing", name: "Детейлинг", note: "Глубокая чистка и защита", price: "от 2 900 ₽", time: "2–3 часа", icon: "◇" },
];

const slots = ["09:00", "10:30", "12:00", "13:30", "15:00", "16:30", "18:00", "19:30"];

function nextDates() {
  const formatter = new Intl.DateTimeFormat("ru-RU", { weekday: "short" });
  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    const iso = date.toISOString().slice(0, 10);
    return { iso, day: formatter.format(date).replace(".", ""), number: date.getDate() };
  });
}

export default function Home() {
  const dates = useMemo(nextDates, []);
  const [service, setService] = useState("complex");
  const [date, setDate] = useState(dates[0].iso);
  const [time, setTime] = useState("12:00");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    const form = new FormData(event.currentTarget);
    const payload = { service, date, time, name: form.get("name"), phone: form.get("phone"), car: form.get("car") };
    try {
      const response = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось создать запись");
      setStatus("success");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Попробуйте ещё раз");
      setStatus("error");
    }
  }

  return (
    <main>
      <nav className="nav shell">
        <a className="brand" href="#top"><span>W</span> WASH//LAB</a>
        <div className="navlinks"><a href="#services">Услуги</a><a href="#booking">Запись</a><a href="#contacts">Контакты</a></div>
        <a className="navphone" href="tel:+79991234567">+7 999 123-45-67</a>
      </nav>

      <section className="hero shell" id="top">
        <div className="heroCopy">
          <div className="eyebrow"><i /> Автомойка нового поколения</div>
          <h1>ЧИСТОТА,<br />КОТОРУЮ <em>ВИДНО.</em></h1>
          <p>Бережная мойка, профессиональная химия и внимание к каждой детали. Пока мы занимаемся машиной — ты отдыхаешь.</p>
          <div className="heroActions"><a className="primary" href="#booking">Записаться онлайн <b>↗</b></a><span>★ 4.9 <small>на Яндекс Картах</small></span></div>
        </div>
        <div className="heroVisual" aria-label="Стилизованный силуэт автомобиля">
          <div className="glow" /><div className="car"><div className="roof" /><div className="body" /><div className="wheel left" /><div className="wheel right" /></div>
          <div className="stat"><strong>12 480</strong><span>чистых автомобилей</span></div>
          <div className="open"><i /> Сегодня работаем<br /><b>до 22:00</b></div>
        </div>
      </section>

      <div className="ticker"><div>БЕЗОПАСНАЯ ХИМИЯ <b>✦</b> БЕЗ РАЗВОДОВ <b>✦</b> ГАРАНТИЯ КАЧЕСТВА <b>✦</b> ЗАПИСЬ ЗА 30 СЕКУНД <b>✦</b> БЕЗОПАСНАЯ ХИМИЯ</div></div>

      <section className="section shell" id="services">
        <div className="sectionHead"><div><span>01 / УСЛУГИ</span><h2>Выбери свой<br />уровень чистоты</h2></div><p>Честные цены без доплат на месте.<br />Всё необходимое уже включено.</p></div>
        <div className="serviceGrid">
          {services.map((item, index) => <article className={item.popular ? "serviceCard featured" : "serviceCard"} key={item.id}>
            {item.popular && <label>ХИТ</label>}<div className="serviceTop"><span>0{index + 1}</span><b>{item.icon}</b></div><h3>{item.name}</h3><p>{item.note}</p><div className="serviceBottom"><strong>{item.price}</strong><span>{item.time}</span></div>
          </article>)}
        </div>
      </section>

      <section className="bookingSection" id="booking">
        <div className="shell bookingGrid">
          <div className="bookingIntro"><span>02 / ОНЛАЙН-ЗАПИСЬ</span><h2>ТВОЯ МАШИНА.<br /><em>ТВОЁ ВРЕМЯ.</em></h2><p>Выбери удобное окно — мы подготовим бокс и будем ждать тебя без очереди.</p><div className="steps"><b>1</b><i /><b>2</b><i /><b>3</b></div></div>
          <form className="bookingCard" onSubmit={submitBooking}>
            {status === "success" ? <div className="success"><div>✓</div><h3>Запись создана!</h3><p>Ждём тебя {dates.find(d => d.iso === date)?.number}-го числа в {time}. Подтверждение отправим по телефону.</p><button type="button" onClick={() => setStatus("idle")}>Создать ещё запись</button></div> : <>
              <div className="formStep"><span>01</span><div><h3>Что моем?</h3><div className="choiceRow">{services.map(item => <button type="button" className={service === item.id ? "active" : ""} onClick={() => setService(item.id)} key={item.id}>{item.name}<small>{item.price}</small></button>)}</div></div></div>
              <div className="formStep"><span>02</span><div><h3>Когда удобно?</h3><div className="dateRow">{dates.map(item => <button type="button" className={date === item.iso ? "active" : ""} onClick={() => setDate(item.iso)} key={item.iso}><small>{item.day}</small>{item.number}</button>)}</div><div className="slotRow">{slots.map(slot => <button type="button" className={time === slot ? "active" : ""} onClick={() => setTime(slot)} key={slot}>{slot}</button>)}</div></div></div>
              <div className="formStep"><span>03</span><div><h3>Как с тобой связаться?</h3><div className="fields"><input name="name" aria-label="Имя" placeholder="Твоё имя" required /><input name="phone" aria-label="Телефон" type="tel" placeholder="+7 (___) ___-__-__" required /><input name="car" aria-label="Автомобиль" placeholder="Марка и модель авто" required /></div><button className="submit" disabled={status === "loading"}>{status === "loading" ? "Создаём запись…" : "Подтвердить запись →"}</button>{status === "error" && <p className="error">{message}</p>}<small className="policy">Нажимая кнопку, ты соглашаешься с обработкой данных</small></div></div>
            </>}
          </form>
        </div>
      </section>

      <footer id="contacts"><div className="shell footerGrid"><div><a className="brand" href="#top"><span>W</span> WASH//LAB</a><p>Чистота без компромиссов.</p></div><div><small>АДРЕС</small><p>ул. Автомобильная, 12<br />Ежедневно 08:00–22:00</p></div><div><small>СВЯЗАТЬСЯ</small><a href="tel:+79991234567">+7 999 123-45-67</a><a href="https://t.me/">Telegram ↗</a></div></div><div className="shell copyright">© 2026 WASH//LAB <span>Политика конфиденциальности</span></div></footer>
    </main>
  );
}
