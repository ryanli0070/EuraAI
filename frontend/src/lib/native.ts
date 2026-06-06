/**
 * Native (Capacitor) integration. Everything here is a no-op on the web build
 * — `Capacitor.isNativePlatform()` is false in the browser, so the Vercel
 * deployment behaves exactly as before. These touches (native splash, status
 * bar styling, haptics) make the iOS build feel like a real app rather than a
 * wrapped website, which is what App Review Guideline 4.2 looks for.
 */
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

export const isNative = Capacitor.isNativePlatform()

/**
 * Run once at app startup (before/around React mount). Styles the status bar to
 * match EuraAI's light UI and dismisses the native splash once the web layer is
 * up so users never see a white flash.
 */
export async function initNative(): Promise<void> {
  if (!isNative) return

  // Tag the <html> element so CSS can apply safe-area insets only on device.
  document.documentElement.classList.add('native', `native-${Capacitor.getPlatform()}`)

  try {
    // App background is light (#fafafa) → dark status-bar content.
    await StatusBar.setStyle({ style: Style.Light })
  } catch {
    // StatusBar isn't available on every platform; ignore.
  }

  // Hide the native splash now that the web UI has rendered.
  try {
    await SplashScreen.hide()
  } catch {
    /* no splash plugin / web — ignore */
  }
}

/** Light haptic tap for buttons/affirmative actions. No-op on web. */
export async function hapticTap(): Promise<void> {
  if (!isNative) return
  try {
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch {
    /* ignore */
  }
}
