import { WifiOff, TriangleAlert } from 'lucide-react'

import { ItemPage } from '@/components/item-page'
import { ModeToggle } from '@/components/mode-toggle'
import { ReviewPage } from '@/components/review-page'
import { ReviewsPage } from '@/components/reviews-page'
import { SkillsPage } from '@/components/skills-page'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { GuidePage } from '@/components/guide-page'
import { useReview, useVersion } from '@/hooks/use-mimesis'
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
  const { version, online, otherFolder } = useVersion()

  return (
    <TooltipProvider>
      <div className="flex h-svh flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
          <button onClick={() => go('#/')} className="flex items-center gap-2 font-semibold">
            <img src="/favicon.png" alt="" className="size-5" />
            Mimesis
          </button>
          {route.page === 'review' && (
            <button onClick={() => go(reviewHash(route.id))} className="text-sm text-muted-foreground hover:text-foreground">
              / Review {route.id}
            </button>
          )}
          <nav className="ml-4 flex gap-1">
            <Button variant={route.page === 'reviews' || route.page === 'review' ? 'secondary' : 'ghost'} size="sm" onClick={() => go('#/')}>
              Reviews
            </Button>
            <Button variant={route.page === 'skills' ? 'secondary' : 'ghost'} size="sm" onClick={() => go('#/skills')}>
              Skills
            </Button>
            <Button variant={route.page === 'guide' ? 'secondary' : 'ghost'} size="sm" onClick={() => go('#/guide')}>
              Guide
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
        {otherFolder && (
          <div data-other-folder className="flex items-center gap-2 border-b border-yellow-300 bg-yellow-100 px-4 py-2 text-sm text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
            <TriangleAlert className="size-4 shrink-0" />
            <span>
              This Mimesis keeps its reviews in <code className="font-mono">{otherFolder}</code>, not the usual <code className="font-mono">~/.mimesis</code>. Work here won't show up in the
              app or your usual page.
            </span>
          </div>
        )}
        <main className="flex min-h-0 flex-1 flex-col">
          {route.page === 'reviews' && <ReviewsPage version={version} />}
          {route.page === 'skills' && <SkillsPage version={version} />}
          {route.page === 'guide' && <GuidePage />}
          {route.page === 'review' && <ReviewRoute id={route.id} itemId={route.item} version={version} />}
        </main>
      </div>
      <Toaster position="bottom-left" />
    </TooltipProvider>
  )
}
