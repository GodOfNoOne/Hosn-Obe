/** Per-tab resume token: survives reloads, but two tabs never share a seat. */
const KEY = "hosnobe.token"
/** Last online seat on this device, for "Return to game" after leaving or an app restart. */
const SEAT_KEY = "hosnobe.seat"

export interface SavedSeat {
  token: string
  code: string
}

export function loadToken(): string | null {
  return sessionStorage.getItem(KEY)
}

export function saveToken(token: string, code: string): void {
  sessionStorage.setItem(KEY, token)
  localStorage.setItem(SEAT_KEY, JSON.stringify({ token, code }))
}

export function clearToken(): void {
  sessionStorage.removeItem(KEY)
}

export function loadSeat(): SavedSeat | null {
  try {
    const seat = JSON.parse(localStorage.getItem(SEAT_KEY) ?? "null")
    return typeof seat?.token === "string" && typeof seat?.code === "string"
      ? seat
      : null
  } catch {
    return null
  }
}

export function forgetSeat(): void {
  localStorage.removeItem(SEAT_KEY)
}

const NAME_KEY = "hosnobe.name"

export function loadName(): string {
  return localStorage.getItem(NAME_KEY) ?? ""
}

export function saveName(name: string): void {
  localStorage.setItem(NAME_KEY, name.trim())
}
