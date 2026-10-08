"use client";

import { useEffect } from "react";
import { applyPrefs, readPrefs, PREFS_EVENT } from "@/lib/prefs";

/** Держит настройки применёнными: после загрузки, при смене в другой вкладке и раз в минуту (автотема меняется со временем суток). */
export default function PrefsSync() {
  useEffect(() => {
    const run = () => applyPrefs(readPrefs());
    run();
    const t = setInterval(run, 60_000);
    window.addEventListener("storage", run);
    window.addEventListener(PREFS_EVENT, run);
    return () => {
      clearInterval(t);
      window.removeEventListener("storage", run);
      window.removeEventListener(PREFS_EVENT, run);
    };
  }, []);
  return null;
}
