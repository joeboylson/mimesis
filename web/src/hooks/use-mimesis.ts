import { useCallback, useEffect, useState } from 'react'

import { api, type Review, type ReviewSummary } from '@/lib/api'

const POLL_MS = 1500

// The command line writes to the same store, so the page watches a version
// number the server bumps on every change, and reloads when it moves.
export function useVersion() {
  const [version, setVersion] = useState<number | null>(null)
  const [online, setOnline] = useState(true)
  useEffect(() => {
    let stopped = false
    const check = () =>
      api
        .version()
        .then(({ version }) => {
          if (stopped) return
          setOnline(true)
          setVersion(version)
        })
        .catch(() => !stopped && setOnline(false))
    check()
    const timer = setInterval(check, POLL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [])
  return { version, online }
}

function useLoaded<T>(load: () => Promise<T>, version: number | null, key: unknown) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(() => {
    load()
      .then((value) => {
        setData(value)
        setError(null)
      })
      .catch((e: Error) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  useEffect(() => {
    if (version !== null) reload()
  }, [version, reload])
  return { data, error, reload }
}

export const useReviews = (version: number | null) => useLoaded<ReviewSummary[]>(api.reviews, version, 'reviews')

export const useReview = (id: number, version: number | null) => useLoaded<Review>(() => api.review(id), version, id)
