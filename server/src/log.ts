// Keep test output clean.
const silent = process.env.VITEST !== undefined

/** Timestamped server event log, optionally tagged with a room code. */
export function log(room: string | null, message: string): void {
  if (silent) return
  const time = new Date().toISOString().slice(11, 19)
  console.log(`${time}${room ? ` [${room}]` : ""} ${message}`)
}

/** Quote a user-supplied name; JSON escaping stops newlines forging log lines. */
export function q(name: string): string {
  return JSON.stringify(name)
}
