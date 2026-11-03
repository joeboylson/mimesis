import { useEffect, useState } from 'react'

// Hash routes, so the page works the same from the server and inside the app:
//   #/                 reviews
//   #/r/<id>           one review
//   #/r/<id>/<item>    one item, inside its review
//   #/skills           skills for agents
//   #/guide            how it works
export type Route = { page: 'reviews' } | { page: 'skills' } | { page: 'guide' } | { page: 'review'; id: number; item: number | null }

export function parseRoute(hash: string): Route {
  const [, kind, id, item] = hash.replace(/^#/, '').split('/')
  if (kind === 'skills') return { page: 'skills' }
  if (kind === 'guide') return { page: 'guide' }
  const reviewId = Number(id)
  if (kind === 'r' && reviewId) return { page: 'review', id: reviewId, item: Number(item) || null }
  return { page: 'reviews' }
}

export const go = (hash: string) => {
  window.location.hash = hash
}

export const reviewHash = (reviewId: number) => `#/r/${reviewId}`
export const itemHash = (reviewId: number, itemId: number) => `#/r/${reviewId}/${itemId}`

export function useRoute() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
