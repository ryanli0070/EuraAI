/**
 * Disclosure + permission dialog shown before the first AI request (App Store
 * guideline 5.1.2(i)): says exactly what leaves the device and who receives
 * it, and requires an explicit "Allow" before anything is sent. Declining
 * closes the dialog without sending; the ask re-appears on the next AI action,
 * and the choice can be changed anytime in Settings → Privacy.
 */
import { Sparkles } from 'lucide-react'

export function AiConsentDialog({
  onAllow,
  onDecline,
}: {
  onAllow: () => void
  onDecline: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-neutral-900/40 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-consent-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <Sparkles className="h-4.5 w-4.5" size={18} strokeWidth={2.25} />
          </span>
          <h2 id="ai-consent-title" className="text-base font-semibold text-neutral-900">
            Share your work with Orion?
          </h2>
        </div>

        <p className="mb-2 text-sm leading-relaxed text-neutral-600">
          Orion, Eura&apos;s AI tutor, needs to read your work to help. When you use
          Check Work, Hint, Help, or the chat, Eura sends the following to{' '}
          <span className="font-semibold text-neutral-800">OpenAI</span>, our AI provider,
          to generate feedback:
        </p>
        <ul className="mb-2 list-disc space-y-0.5 pl-5 text-sm leading-relaxed text-neutral-600">
          <li>a picture of the handwriting on your current canvas,</li>
          <li>the transcribed text of that work, and</li>
          <li>your chat messages with Orion.</li>
        </ul>
        <p className="mb-4 text-sm leading-relaxed text-neutral-600">
          OpenAI processes this only to provide the service and doesn&apos;t use it to
          train its models. Avoid writing personal details (like your full name or
          address) on the canvas. You can change this anytime in Settings. Learn more
          in our{' '}
          <a
            href="https://euralearn.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 underline"
          >
            Privacy Policy
          </a>
          .
        </p>

        <div className="flex justify-end gap-2">
          <button
            onClick={onDecline}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-100"
            style={{ touchAction: 'manipulation' }}
          >
            Not now
          </button>
          <button
            onClick={onAllow}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-transform hover:bg-blue-700 active:scale-95"
            style={{ touchAction: 'manipulation' }}
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  )
}
