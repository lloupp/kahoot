const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getToken(): string | null {
  return localStorage.getItem("quizarena_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : undefined;

  if (!res.ok) {
    throw new ApiError(res.status, extractErrorMessage(body));
  }
  return body as T;
}

interface ZodIssueLike {
  message: string;
  path: (string | number)[];
}

/** Prefer a specific field-level message (from the server's zod validation
 * details) over the generic "Validation failed" — the client already
 * validates most of this before submitting, so this mainly guards against
 * something slipping past that check. */
export function extractErrorMessage(body: unknown): string {
  const b = body as { error?: string; details?: ZodIssueLike[] } | undefined;
  const firstIssue = b?.details?.[0];
  if (firstIssue) {
    const field = firstIssue.path.filter((p) => typeof p === "string").join(".");
    return field ? `${field}: ${firstIssue.message}` : firstIssue.message;
  }
  return b?.error ?? "Something went wrong. Please try again.";
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data !== undefined ? JSON.stringify(data) : undefined }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PUT", body: data !== undefined ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export { API_URL };
