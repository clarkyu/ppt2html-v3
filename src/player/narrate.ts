// Narrated auto-play: read each slide's speaker script aloud with the browser's
// built-in speech synthesis (no key, works offline), then advance to the next
// page — the deck plays itself like a narrated course. The full scripts written
// by the AI speaker-script pass make ideal narration; pages without a note fall
// back to speaking their visible content.

import type { Deck, Slide } from '../types'
import type { PlayerHandle } from './player'
import { deckIsCjk, hasCjk } from '../lib/lang'

export interface NarratorHandle {
  stop: () => void
  active: () => boolean
}

interface NarrateHooks {
  /** The last slide finished (narrator already stopped). */
  onEnd?: () => void
}

function stripMd(s: string | undefined): string {
  return (s ?? '').replace(/\*\*(.+?)\*\*/g, '$1')
}

/** What to say for a slide: the script if present, else its visible content.
 * Separators follow the slide's script: an English page read with "。" and
 * "，" makes the TTS voice stumble. */
export function speechText(s: Slide): string {
  const note = (s.note ?? '').trim()
  if (note) return stripMd(note)
  const cjk = hasCjk([s.title, s.subtitle, s.body, s.text, s.value, ...(s.bullets ?? [])].filter(Boolean).join(''))
  const STOP = cjk ? '。' : '. '
  const COMMA = cjk ? '，' : ', '
  const COLON = cjk ? '：' : ': '
  const parts: string[] = [stripMd(s.title)]
  if (s.subtitle) parts.push(stripMd(s.subtitle))
  if (s.bullets?.length) parts.push(s.bullets.map(stripMd).join(STOP))
  if (s.stats?.length) parts.push(s.stats.map((x) => `${x.label}${COMMA}${x.value}`).join(STOP))
  if (s.value) parts.push(`${stripMd(s.value)}${STOP}${stripMd(s.caption)}`)
  if (s.text) parts.push(`${stripMd(s.text)}${s.author ? `${STOP}${stripMd(s.author)}` : ''}`)
  if (s.items?.length) parts.push(s.items.map((it) => `${stripMd(it.heading)}${COLON}${(it.points ?? []).map(stripMd).join(COMMA)}`).join(STOP))
  if (s.steps?.length) parts.push(s.steps.map((st) => `${stripMd(st.label)}${st.text ? `${COMMA}${stripMd(st.text)}` : ''}`).join(STOP))
  if (s.body) parts.push(stripMd(s.body))
  if (s.left || s.right) {
    const col = (c: Slide['left']): string => (c ? `${stripMd(c.heading)}${COLON}${(c.bullets ?? []).map(stripMd).join(COMMA)}` : '')
    parts.push([col(s.left), col(s.right)].filter(Boolean).join(STOP))
  }
  return parts.filter(Boolean).join(STOP).trim()
}

function pickVoice(cjk: boolean): SpeechSynthesisVoice | undefined {
  const want = cjk ? 'zh' : 'en'
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(want))
  // Local voices start instantly and work offline; default-flagged ones sound best.
  return voices.find((v) => v.localService && v.default) ?? voices.find((v) => v.localService) ?? voices[0]
}

/**
 * Start narrating from the current slide. Returns null when the browser has no
 * speech synthesis. Manual navigation while active jumps the narration to the
 * newly shown slide instead of fighting the presenter.
 */
export function startNarration(deck: Deck, player: PlayerHandle, hooks: NarrateHooks = {}): NarratorHandle | null {
  const synth = window.speechSynthesis
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return null

  const cjk = deckIsCjk(deck)
  const total = deck.slides.length
  let live = true
  let seq = 0
  let expected = -1 // slide number (1-based) of our own programmatic jump
  let watchdog = 0

  // Chrome desktop silently pauses long utterances after ~15s; a periodic
  // pause/resume cycle keeps the engine talking.
  const keepalive = window.setInterval(() => {
    if (synth.speaking && !synth.paused) {
      synth.pause()
      synth.resume()
    }
  }, 12000)

  // Auto-play must SHOW what it reads: in click-to-reveal step mode every
  // page it advanced to sat with all its bullets hidden. Fragments are off for
  // the session and restored to the user's preference when narration stops.
  const stepping = player.stepMode()
  if (stepping) {
    player.reveal.configure({ fragments: false })
    player.reveal.sync()
  }

  let offSlide: () => void = () => {}
  let offVoices: () => void = () => {}
  const stop = (): void => {
    if (!live) return
    live = false
    window.clearInterval(keepalive)
    window.clearTimeout(watchdog)
    offSlide()
    offVoices()
    synth.cancel()
    if (stepping && player.stepMode()) {
      try {
        player.reveal.configure({ fragments: true })
        player.reveal.sync()
      } catch {
        /* player may already be torn down */
      }
    }
  }

  const finished = (): void => {
    stop()
    hooks.onEnd?.()
  }

  const speakSlide = (idx: number): void => {
    if (!live) return
    const mySeq = ++seq
    window.clearTimeout(watchdog)
    synth.cancel()
    const text = speechText(deck.slides[idx])
    if (!text) {
      advance(idx, mySeq)
      return
    }
    const u = new SpeechSynthesisUtterance(text)
    u.lang = cjk ? 'zh-CN' : 'en-US'
    const voice = pickVoice(cjk)
    if (voice) u.voice = voice
    const done = (): void => {
      if (!live || mySeq !== seq) return
      advance(idx, mySeq)
    }
    u.onend = done
    u.onerror = done
    // Safety net: some engines drop the end event (or have no voices at all) —
    // never let the auto-play hang. Budget generously by text length.
    window.clearTimeout(watchdog)
    watchdog = window.setTimeout(done, 12000 + text.length * 350)
    synth.speak(u)
  }

  const advance = (idx: number, mySeq: number): void => {
    if (!live || mySeq !== seq) return
    const next = idx + 1
    if (next >= total) {
      finished()
      return
    }
    // A short breath between pages reads more naturally than a hard cut.
    window.setTimeout(() => {
      if (!live || mySeq !== seq) return
      expected = next + 1
      player.reveal.slide(next)
      speakSlide(next)
    }, 450)
  }

  // Manual navigation re-anchors the narration to whatever page is shown.
  // (Unsubscribed on stop — each start used to leave its listener behind.)
  offSlide = player.onSlideChange((num) => {
    if (!live) return
    if (num === expected) return
    expected = num
    speakSlide(num - 1)
  })

  // Voices load asynchronously on first use in some browsers; a one-shot
  // refresh re-speaks the current page with the proper voice once they arrive.
  if (!synth.getVoices().length) {
    const once = (): void => {
      synth.removeEventListener?.('voiceschanged', once)
      if (live) speakSlide(player.getIndices().h)
    }
    synth.addEventListener?.('voiceschanged', once)
    offVoices = () => synth.removeEventListener?.('voiceschanged', once)
  }

  expected = player.getIndices().h + 1
  speakSlide(player.getIndices().h)
  return { stop, active: () => live }
}
