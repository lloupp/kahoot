import { FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "../components/Card";
import { TextField } from "../components/TextField";
import { Button } from "../components/Button";
import { ErrorBanner } from "../components/Feedback";
import { emitAsync } from "../api/socket";
import { participantStorageKey } from "../lib/participantStorage";

export function StudentJoin() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [pin, setPin] = useState(searchParams.get("pin") ?? "");
  const [name, setName] = useState("");
  const [step, setStep] = useState<"pin" | "name">("pin");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handlePinSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = pin.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError("Enter the 6-digit game PIN.");
      return;
    }
    setError(null);
    setStep("name");
  }

  async function handleNameSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Enter a name to join with.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const res = await emitAsync<{ participantId: string; joinToken: string }>("student:join", {
      pin: pin.trim(),
      name: name.trim(),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error);
      if (res.code === "PIN_NOT_FOUND" || res.code === "GAME_OVER") setStep("pin");
      return;
    }
    sessionStorage.setItem(
      participantStorageKey(pin.trim()),
      JSON.stringify({ participantId: res.data.participantId, joinToken: res.data.joinToken, name: name.trim() }),
    );
    navigate(`/play/${pin.trim()}`);
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-16">
      <h1 className="text-center text-2xl font-bold text-brand-800">Join a game</h1>
      <Card>
        {step === "pin" ? (
          <form className="flex flex-col gap-4" onSubmit={handlePinSubmit}>
            {error && <ErrorBanner message={error} />}
            <TextField
              label="Game PIN"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoFocus
              placeholder="123456"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
            <Button type="submit" size="lg">
              Next
            </Button>
          </form>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={handleNameSubmit}>
            {error && <ErrorBanner message={error} />}
            <TextField
              label="Your name"
              autoFocus
              maxLength={20}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" size="lg" disabled={submitting}>
              {submitting ? "Joining..." : "Join game"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep("pin")}>
              Back
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
