/**
 * useDictation — voice-to-text for the Orion input via Apple's on-device speech
 * engine (SFSpeechRecognizer), wrapped by @capacitor-community/speech-recognition.
 *
 * Native-only: the plugin doesn't exist on the web build, so `supported` stays
 * false there and the caller hides the mic. While listening, partial transcripts
 * stream in through the `partialResults` event and are handed back via the
 * `onResult` callback passed to `start()`, so text flows live into the field
 * (no modal UI). Calling `start()` again toggles off through `stop()`.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { SpeechRecognition } from '@capacitor-community/speech-recognition'

export function useDictation() {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const onResultRef = useRef<((text: string) => void) | null>(null)

  // Probe availability once. Only native builds have the plugin at all.
  useEffect(() => {
    if (Capacitor.getPlatform() === 'web') return
    let cancelled = false
    SpeechRecognition.available()
      .then(({ available }) => { if (!cancelled) setSupported(available) })
      .catch(() => { if (!cancelled) setSupported(false) })
    return () => {
      cancelled = true
      void SpeechRecognition.removeAllListeners()
    }
  }, [])

  const stop = useCallback(async () => {
    try { await SpeechRecognition.stop() } catch { /* not running */ }
    try { await SpeechRecognition.removeAllListeners() } catch { /* noop */ }
    onResultRef.current = null
    setListening(false)
  }, [])

  const start = useCallback(async (onResult: (text: string) => void) => {
    try {
      let perm = await SpeechRecognition.checkPermissions()
      if (perm.speechRecognition !== 'granted') {
        perm = await SpeechRecognition.requestPermissions()
        if (perm.speechRecognition !== 'granted') return
      }
      onResultRef.current = onResult
      await SpeechRecognition.removeAllListeners()
      await SpeechRecognition.addListener('partialResults', (data: { matches: string[] }) => {
        const text = data.matches?.[0]
        if (text) onResultRef.current?.(text)
      })
      await SpeechRecognition.addListener('listeningState', (data: { status: 'started' | 'stopped' }) => {
        if (data.status === 'stopped') setListening(false)
      })
      setListening(true)
      await SpeechRecognition.start({
        language: 'en-US',
        maxResults: 2,
        partialResults: true,
        popup: false,
      })
    } catch {
      onResultRef.current = null
      setListening(false)
    }
  }, [])

  return { supported, listening, start, stop }
}
