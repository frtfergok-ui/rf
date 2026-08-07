import type { Metadata } from "next";
import "./staff.css";

export const metadata: Metadata = {
  title: "Панель сотрудника — MALL AUTO WASH",
  description: "Управление записями клиентов MALL AUTO WASH",
};

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return children;
}
