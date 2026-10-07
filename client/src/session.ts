/** Per-tab resume token: survives reloads, but two tabs never share a seat. */
const KEY = "hosnobe.token";

export function loadToken(): string | null {
  return sessionStorage.getItem(KEY);
}

export function saveToken(token: string): void {
  sessionStorage.setItem(KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(KEY);
}

const NAME_KEY = "hosnobe.name";

export function loadName(): string {
  return localStorage.getItem(NAME_KEY) ?? "";
}

export function saveName(name: string): void {
  localStorage.setItem(NAME_KEY, name.trim());
}

const SERVER_KEY = "hosnobe.server";

/** Server address chosen in Settings, or `null` for the built-in default. */
export function loadServerUrl(): string | null {
  return localStorage.getItem(SERVER_KEY);
}

export function saveServerUrl(url: string | null): void {
  if (url) localStorage.setItem(SERVER_KEY, url);
  else localStorage.removeItem(SERVER_KEY);
}
