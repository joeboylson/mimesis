import { Badge } from '@/components/ui/badge'
import type { ItemState } from '@/lib/api'
import { cn } from '@/lib/utils'

const LABELS: Record<ItemState, string> = {
  needs_review: 'Needs review',
  reviewed: 'Reviewed',
  approved: 'Approved',
}

// Needs review = yellow, reviewed = blue, approved = green.
export const STATE_COLORS: Record<ItemState, string> = {
  needs_review: 'border-yellow-300 bg-yellow-100 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200',
  reviewed: 'border-blue-300 bg-blue-100 text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200',
  approved: 'border-green-300 bg-green-100 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200',
}

export function StateBadge({ state, className }: { state: ItemState; className?: string }) {
  return (
    <Badge variant="outline" className={cn(STATE_COLORS[state], className)}>
      {LABELS[state]}
    </Badge>
  )
}
