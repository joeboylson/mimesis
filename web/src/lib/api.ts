// The server's API. Shapes match crates/mimesis/src/model.rs.

export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'ellipse'; x: number; y: number; w: number; h: number }
  | { kind: 'arrow'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'pen'; points: [number, number][] }
  | { kind: 'pin'; x: number; y: number }

export type Annotation = Shape & { id: string; color: string; note: string }

export type ItemState = 'needs_review' | 'reviewed' | 'approved'

export type Round = {
  id: number
  item_id: number
  number: number
  image: string
  width: number
  height: number
  ai_note: string
  annotations: Annotation[]
  note: string
  sent_at: number | null
  created_at: number
}

export type Item = {
  id: number
  review_id: number
  name: string
  state: ItemState
  approved_at: number | null
  rounds: Round[]
}

export type ReviewSummary = {
  id: number
  title: string
  created_at: number
  updated_at: number
  archived: boolean
  total: number
  needs_review: number
  reviewed: number
  approved: number
  cover: string | null
}

export type Review = {
  id: number
  title: string
  created_at: number
  archived: boolean
  items: Item[]
}

export type Skill = {
  id: string
  name: string
  description: string
  files: string[]
  content: string
  installed: boolean
  install_command: string
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init)
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.error ?? `${response.status} ${response.statusText}`)
  return body as T
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const imageUrl = (file: string) => `/api/images/${file}`
export const bakedUrl = (round: Round) => `/api/rounds/${round.id}/baked.png?v=${round.annotations.length}-${round.note.length}`

export const latest = (item: Item) => item.rounds[item.rounds.length - 1]

export const api = {
  version: () => call<{ version: number }>('/version'),
  skills: () => call<Skill[]>('/skills'),
  reviews: () => call<ReviewSummary[]>('/reviews'),
  review: (id: number) => call<Review>(`/reviews/${id}`),
  createReview: (title: string) => call<Review>('/reviews', json('POST', { title })),
  updateReview: (id: number, change: { title?: string; archived?: boolean }) => call<Review>(`/reviews/${id}`, json('PATCH', change)),
  deleteReview: (id: number) => call<null>(`/reviews/${id}`, { method: 'DELETE' }),
  addImage: (reviewId: number, file: File) =>
    call<Item>(`/reviews/${reviewId}/items?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file }),
  sendAll: (reviewId: number) => call<{ sent: number[] }>(`/reviews/${reviewId}/send`, { method: 'POST' }),
  deleteItem: (id: number) => call<null>(`/items/${id}`, { method: 'DELETE' }),
  send: (id: number) => call<Item>(`/items/${id}/send`, { method: 'POST' }),
  unsend: (id: number) => call<Item>(`/items/${id}/unsend`, { method: 'POST' }),
  approve: (id: number) => call<Item>(`/items/${id}/approve`, { method: 'POST' }),
  reopen: (id: number) => call<Item>(`/items/${id}/reopen`, { method: 'POST' }),
  saveMarks: (roundId: number, annotations: Annotation[], note: string) =>
    call<null>(`/rounds/${roundId}/marks`, json('PUT', { annotations, note })),
}

export const isImage = (file: File) => file.type.startsWith('image/')

export async function addImages(reviewId: number, files: File[]) {
  for (const file of files.filter(isImage)) await api.addImage(reviewId, file)
}
