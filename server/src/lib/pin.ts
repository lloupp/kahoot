/** Generates a 6-digit numeric PIN, avoiding collisions with active sessions. */
export function generatePin(isTaken: (pin: string) => boolean, maxAttempts = 50): string {
  for (let i = 0; i < maxAttempts; i++) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    if (!isTaken(pin)) return pin;
  }
  throw new Error("Could not generate a unique PIN, too many active sessions");
}
