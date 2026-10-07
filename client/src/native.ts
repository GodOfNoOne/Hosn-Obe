/** Thin wrappers over Capacitor plugins; failures (e.g. unsupported in a desktop browser) are ignored. */
import { KeepAwake } from "@capacitor-community/keep-awake"
import { App } from "@capacitor/app"
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics"

const ignore = () => {}

export function tapFeedback(): void {
  Haptics.impact({ style: ImpactStyle.Light }).catch(ignore)
}

export function turnFeedback(): void {
  Haptics.notification({ type: NotificationType.Success }).catch(ignore)
}

export function keepAwake(on: boolean): void {
  ;(on ? KeepAwake.keepAwake() : KeepAwake.allowSleep()).catch(ignore)
}

export function exitApp(): void {
  App.exitApp().catch(ignore)
}

/** Runs `cb` when the app returns to the foreground. Returns an unsubscribe function. */
export function onResume(cb: () => void): () => void {
  const handle = App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) cb()
  })
  return () => void handle.then((h) => h.remove())
}

/** Takes over the Android back button. Returns an unsubscribe function. */
export function onBackButton(cb: () => void): () => void {
  const handle = App.addListener("backButton", cb)
  return () => void handle.then((h) => h.remove())
}
