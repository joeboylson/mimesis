import { Badge } from '@/components/ui/badge'
import type { ItemState } from '@/lib/api'

const LABELS: Record<ItemState, string> = {
  needs_review: 'Needs review',
  reviewed: 'Reviewed',
  approved: 'Approved',
}

const VARIANTS: Record<ItemState, 'default' | 'secondary' | 'outline'> = {
  needs_review: 'default',
  reviewed: 'secondary',
  approved: 'outline',
}

export function StateBadge({ state }: { state: ItemState }) {
  return <Badge variant={VARIANTS[state]}>{LABELS[state]}</Badge>
}
