/** Per-tab resume token: survives reloads, but two tabs never share a seat. */
const KEY = "hosnobe.token"

export function loadToken(): string | null {
  return sessionStorage.getItem(KEY)
}

export function saveToken(token: string): void {
  sessionStorage.setItem(KEY, token)
}

export function clearToken(): void {
  sessionStorage.removeItem(KEY)
}

const NAME_KEY = "hosnobe.name"

export function loadName(): string {
  return localStorage.getItem(NAME_KEY) ?? ""
}

export function saveName(name: string): void {
  localStorage.setItem(NAME_KEY, name.trim())
}
