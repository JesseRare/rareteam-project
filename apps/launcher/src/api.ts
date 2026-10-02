import type { AuthTokens, LauncherUser, ServerProfile } from "@rare/contracts";

export const apiUrl = ((import.meta.env.VITE_API_URL as string | undefined) || "https://launcher-api.rarenetwork.ru").replace(/\/$/, "");

async function parse<T>(response: Response): Promise<T> {
  if (response.ok) return response.status === 204 ? undefined as T : response.json() as Promise<T>;
  const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` })) as { error?: string };
  throw new Error(body.error ?? `HTTP ${response.status}`);
}

async function request(url: string, init?: RequestInit) {
  try {
    return await fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(15_000) });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("Сервер не ответил вовремя");
    }
    throw new Error("Нет соединения с сервером");
  }
}

export async function authenticate(mode: "login" | "register", body: Record<string, string>) {
  const response = await request(`${apiUrl}/v1/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const tokens = await parse<AuthTokens>(response);
  await window.rare?.saveSession(JSON.stringify(tokens));
  return tokens;
}

async function loadStoredSession(): Promise<AuthTokens | null> {
  const stored = await window.rare?.loadSession();
  if (!stored) return null;
  try { return JSON.parse(stored) as AuthTokens; } catch { return null; }
}

async function refreshSession(refreshToken: string) {
  const refreshed = await parse<AuthTokens>(await request(`${apiUrl}/v1/auth/refresh`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshToken }),
  }));
  await window.rare?.saveSession(JSON.stringify(refreshed));
  return refreshed;
}

export async function restoreSession(): Promise<AuthTokens | null> {
  const stored = await loadStoredSession();
  if (!stored) return null;
  try { return await refreshSession(stored.refreshToken); }
  catch { await window.rare?.clearSession(); return null; }
}

export interface Announcement {
  id: string;
  title: string;
  summary: string;
  imageUrl: string | null;
  publishedAt: string;
}

export async function loadProfiles() {
  return parse<ServerProfile[]>(await request(`${apiUrl}/v1/profiles/`, { cache: "no-store" }));
}

export async function loadNews() {
  return parse<Announcement[]>(await request(`${apiUrl}/v1/news/`, { cache: "no-store" }));
}

async function authorized<T>(session: AuthTokens, path: string, init: RequestInit): Promise<{ data: T; session: AuthTokens }> {
  const send = (tokens: AuthTokens) => request(`${apiUrl}${path}`, { ...init, headers: { ...init.headers, authorization: `Bearer ${tokens.accessToken}` } });
  let response = await send(session);
  if (response.status !== 401) return { data: await parse<T>(response), session };
  const refreshed = await refreshSession(session.refreshToken);
  response = await send(refreshed);
  return { data: await parse<T>(response), session: refreshed };
}

export async function createGameTicket(session: AuthTokens, serverId: string) {
  return authorized<{ ticket: string; expiresIn: number }>(session, "/v1/game/ticket", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ serverId }),
  });
}

export async function uploadSkin(session: AuthTokens, file: File) {
  const form = new FormData(); form.append("skin", file);
  return authorized<{ skinUrl: string }>(session, "/v1/cosmetics/skin", { method: "POST", body: form });
}

export async function uploadCape(session: AuthTokens, file: File) {
  const form = new FormData(); form.append("cape", file);
  return authorized<{ capeUrl: string }>(session, "/v1/cosmetics/cape", { method: "POST", body: form });
}

export async function updateSkinModel(session: AuthTokens, model: "classic" | "slim") {
  return authorized<{ skinModel: "classic" | "slim" }>(session, "/v1/cosmetics/skin-model", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ model }),
  });
}

export async function logout(session: AuthTokens) {
  await request(`${apiUrl}/v1/auth/logout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshToken: session.refreshToken }) });
  await window.rare?.clearSession();
}

export type { AuthTokens, LauncherUser, ServerProfile };
