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
