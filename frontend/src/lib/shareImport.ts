/**
 * Receive files shared/opened into Eura on iOS ("Open in Eura" / "Copy to
 * Eura"). When the user shares a downloaded PDF or photo, iOS copies it into
 * the app's Documents/Inbox and launches us with its file:// URL. We read the
 * bytes, hand them to the import pipeline, and open the resulting canvas.
 *
 * No-op on web (no `appUrlOpen`/native filesystem). The host wires this up once
 * from the authenticated shell via `initShareImport`.
 */
import { App as CapApp } from '@capacitor/app'
import { Filesystem } from '@capacitor/filesystem'
import { isNative } from './native'
import { importFile, type ImportProgress } from './import'

export type ShareImportHandlers = {
  onStart?: () => void
  onProgress?: (p: ImportProgress) => void
  onDone?: (canvasId: string | null) => void
}

function mimeForName(name: string): string {
  switch (name.toLowerCase().split('.').pop()) {
    case 'pdf': return 'application/pdf'
    case 'png': return 'image/png'
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'heic': return 'image/heic'
    case 'heif': return 'image/heif'
    case 'webp': return 'image/webp'
    case 'gif': return 'image/gif'
    default: return 'application/octet-stream'
  }
}

const IMPORTABLE = /\.(pdf|png|jpe?g|heic|heif|webp|gif)$/i

function fileNameFromUrl(url: string): string {
  const last = url.split('?')[0].split('#')[0].split('/').pop() ?? 'import'
  try { return decodeURIComponent(last) } catch { return last }
}

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type })
}

/**
 * Wire up share-import for the lifetime of the authenticated shell. Returns a
 * teardown function. Processes a cold-start launch URL once and listens for
 * warm opens, deduping so the same file is never imported twice per session.
 */
export function initShareImport(handlers: ShareImportHandlers): () => void {
  if (!isNative) return () => {}

  const seen = new Set<string>()

  const handleUrl = async (url?: string | null): Promise<void> => {
    if (!url || !url.startsWith('file://')) return
    const name = fileNameFromUrl(url)
    if (!IMPORTABLE.test(name) || seen.has(url)) return
    seen.add(url)
    handlers.onStart?.()
    let canvasId: string | null = null
    try {
      const read = await Filesystem.readFile({ path: url })
      const data = typeof read.data === 'string' ? read.data : await read.data.text()
      const blob = base64ToBlob(data, mimeForName(name))
      const meta = await importFile({ name, blob }, null, handlers.onProgress)
      canvasId = meta?.id ?? null
    } catch (err) {
      console.error('[shareImport] failed', err)
    } finally {
      handlers.onDone?.(canvasId)
    }
  }

  void CapApp.getLaunchUrl().then((r) => handleUrl(r?.url))
  const subPromise = CapApp.addListener('appUrlOpen', (e) => void handleUrl(e.url))

  return () => { void subPromise.then((s) => s.remove()) }
}
