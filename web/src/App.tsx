import { WifiOff } from 'lucide-react'

import { ItemPage } from '@/components/item-page'
import { ModeToggle } from '@/components/mode-toggle'
import { ReviewPage } from '@/components/review-page'
import { ReviewsPage } from '@/components/reviews-page'
import { SkillsPage } from '@/components/skills-page'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useReview, useVersion } from '@/hooks/use-ochre'
import { go, reviewHash, useRoute } from '@/lib/route'

function ReviewRoute({ id, itemId, version }: { id: number; itemId: number | null; version: number | null }) {
  const { data: review, error } = useReview(id, version)
  if (error) return <div className="p-6 text-sm text-muted-foreground">{error}</div>
  if (!review || review.id !== id) return null
  const item = itemId ? review.items.find((i) => i.id === itemId) : null
  if (itemId && !item) return <div className="p-6 text-sm text-muted-foreground">That image isn't in this review any more.</div>
  return item ? <ItemPage review={review} item={item} /> : <ReviewPage review={review} />
}

export default function App() {
  const route = useRoute()
  const { version, online } = useVersion()

  return (
    <TooltipProvider>
      <div className="flex h-svh flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
          <button onClick={() => go('#/')} className="flex items-center gap-2 font-semibold">
            <img src="/favicon.png" alt="" className="size-5" />
            Ochre
          </button>
          {route.page === 'review' && (
            <button onClick={() => go(reviewHash(route.id))} className="text-sm text-muted-foreground hover:text-foreground">
              / Review {route.id}
            </button>
          )}
          <nav className="ml-4 flex gap-1">
            <Button variant={route.page === 'skills' ? 'ghost' : 'secondary'} size="sm" onClick={() => go('#/')}>
              Reviews
            </Button>
            <Button variant={route.page === 'skills' ? 'secondary' : 'ghost'} size="sm" onClick={() => go('#/skills')}>
              Skills
            </Button>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {!online && (
              <span className="flex items-center gap-1.5 text-xs text-destructive">
                <WifiOff className="size-3.5" />
                Server not reachable
              </span>
            )}
            <ModeToggle />
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col">
          {route.page === 'reviews' && <ReviewsPage version={version} />}
          {route.page === 'skills' && <SkillsPage version={version} />}
          {route.page === 'review' && <ReviewRoute id={route.id} itemId={route.item} version={version} />}
        </main>
      </div>
      <Toaster />
    </TooltipProvider>
  )
}
