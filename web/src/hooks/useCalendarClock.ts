"use client";

import { useEffect, useState } from "react";
import {
  daysInMonth,
  isoLocal,
  monthKeyLocal,
  remainingDaysInMonth,
} from "@/lib/calendar";

export function useCalendarClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    const interval = window.setInterval(tick, 60_000);

    let timeout = 0;
    const armMidnight = () => {
      const n = new Date();
      const next = new Date(
        n.getFullYear(),
        n.getMonth(),
        n.getDate() + 1,
        0,
        0,
        2,
      );
      timeout = window.setTimeout(() => {
        tick();
        armMidnight();
      }, Math.max(1000, next.getTime() - Date.now()));
    };
    armMidnight();

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, []);

  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  return {
    now,
    year,
    month,
    day,
    today: isoLocal(now),
    monthKey: monthKeyLocal(now),
    daysInMonth: daysInMonth(year, month),
    remainingDays: remainingDaysInMonth(now),
  };
}
