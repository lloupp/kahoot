export function participantStorageKey(pin: string) {
  return `quizarena_participant_${pin}`;
}

export interface StoredParticipant {
  participantId: string;
  joinToken: string;
  name: string;
}

export function loadParticipant(pin: string): StoredParticipant | null {
  const raw = sessionStorage.getItem(participantStorageKey(pin));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredParticipant;
  } catch {
    return null;
  }
}
