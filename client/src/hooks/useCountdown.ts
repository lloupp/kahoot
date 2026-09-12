import { useEffect, useState } from "react";

/** Remaining milliseconds until `endsAt` (a server timestamp), ticking every 100ms. */
export function useCountdown(endsAt: number | null): number {
  const [remaining, setRemaining] = useState(() => (endsAt ? Math.max(0, endsAt - Date.now()) : 0));

  useEffect(() => {
    if (!endsAt) {
      setRemaining(0);
      return;
    }
    setRemaining(Math.max(0, endsAt - Date.now()));
    const interval = setInterval(() => {
      setRemaining(Math.max(0, endsAt - Date.now()));
    }, 100);
    return () => clearInterval(interval);
  }, [endsAt]);

  return remaining;
}
