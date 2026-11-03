// The screenshots come from guide/shoot.mjs; run it again when the screens change.
const STEPS = [
  {
    image: '1-review',
    title: 'Start a review',
    text: 'Drop images on the Reviews page, or have your AI add them with mimesis new. Each image waits for you, marked "Needs review".',
  },
  {
    image: '2-mark-up',
    title: 'Mark what should change',
    text: 'Open an image and draw on it: boxes, circles, arrows, lines or pins. Each mark gets a number and a note. When you are done, press Mark as reviewed.',
  },
  {
    image: '3-ai-pulls',
    title: 'Your AI picks it up',
    text: 'Your AI runs mimesis pull. It gets each image with your marks drawn on it and your notes listed by number, makes the changes, and sends back a new image.',
  },
  {
    image: '4-compare',
    title: 'Compare the new version',
    text: 'The image comes back to you with your marks on the left and the new version on the right, plus a note from the AI. Approve it, or switch to Mark up and go again.',
  },
  {
    image: '5-finish',
    title: 'Finish the review',
    text: 'Once every image is approved, press Finish review. It moves out of your list, and Show finished brings it back.',
  },
]

export function GuidePage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-5xl gap-12 p-6 pb-16">
        <div className="grid gap-2">
          <h1 className="text-xl font-semibold">How it works</h1>
          <p className="max-w-2xl text-muted-foreground">
            You and your AI pass images back and forth. You mark what should change, it sends a new version, and you go round until you approve every one.
          </p>
        </div>
        {STEPS.map((step, index) => (
          <section key={step.image} className="grid gap-4">
            <div className="flex items-baseline gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{index + 1}</span>
              <div className="grid gap-1">
                <h2 className="font-semibold">{step.title}</h2>
                <p className="max-w-2xl text-sm text-muted-foreground">{step.text}</p>
              </div>
            </div>
            <img src={`/guide/${step.image}.png`} alt={step.title} className="w-full rounded-lg border shadow-sm" />
          </section>
        ))}
      </div>
    </div>
  )
}
