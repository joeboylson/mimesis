import { useEffect, useRef } from 'react'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { go, reviewHash } from '@/lib/route'

const canNotify = () => typeof window !== 'undefined' && 'Notification' in window

// Asked when the person marks something as reviewed: that's when they start
// waiting for a new version, so the question makes sense then.
export function askToNotify() {
  if (canNotify() && Notification.permission === 'default') Notification.requestPermission().catch(() => {})
}

const plural = (n: number) => `${n} image${n === 1 ? '' : 's'}`

// Lets the person know when images start waiting for them (usually a new
// version from the AI): a notice on the page, the count in the tab title, and
// a notification from the computer when the window isn't in front.
export function useArrivals(version: number | null) {
  const waiting = useRef<Map<number, number> | null>(null)

  useEffect(() => {
    if (version === null) return
    let stale = false
    api
      .reviews()
      .then((reviews) => {
        if (stale) return
        const total = reviews.filter((r) => !r.archived).reduce((sum, r) => sum + r.needs_review, 0)
        document.title = total > 0 ? `(${total}) Mimesis` : 'Mimesis'

        const before = waiting.current
        waiting.current = new Map(reviews.map((r) => [r.id, r.needs_review]))
        // The first load only sets the baseline.
        if (!before) return
        for (const review of reviews) {
          const added = review.needs_review - (before.get(review.id) ?? 0)
          if (added <= 0) continue
          const message = `${plural(added)} ready for you in “${review.title}”`
          toast(message, { action: { label: 'Open', onClick: () => go(reviewHash(review.id)) } })
          if (canNotify() && Notification.permission === 'granted' && document.hidden) {
            const notice = new Notification('Mimesis', { body: message })
            notice.onclick = () => {
              window.focus()
              go(reviewHash(review.id))
            }
          }
        }
      })
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [version])
}
