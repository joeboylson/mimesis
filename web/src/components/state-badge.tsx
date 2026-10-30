import { Badge } from '@/components/ui/badge'
import type { ItemState } from '@/lib/api'

const LABELS: Record<ItemState, string> = {
  with_you: 'With you',
  with_ai: 'With AI',
  approved: 'Approved',
}

const VARIANTS: Record<ItemState, 'default' | 'secondary' | 'outline'> = {
  with_you: 'default',
  with_ai: 'secondary',
  approved: 'outline',
}

export function StateBadge({ state }: { state: ItemState }) {
  return <Badge variant={VARIANTS[state]}>{LABELS[state]}</Badge>
}
