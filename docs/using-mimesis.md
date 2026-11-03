# Using Mimesis

Run `mimesis open` to open Mimesis in your browser. If you installed the
desktop app, it shows the same thing.

## Reviews

A review is a set of images you want changed. To start one, drop images on
the Reviews page or press **New review**. Your AI can also start one for
you with `mimesis new "Title" a.png b.png`.

Each image has a status:

| Status | Color | Meaning |
| --- | --- | --- |
| Needs review | Yellow | Waiting for you to mark it up or approve it |
| Reviewed | Blue | You've marked it up; waiting for your AI to send a new version |
| Approved | Green | Done |

The tabs at the top of a review (All, Needs review, Reviewed, Approved)
show only the images with that status. Mimesis remembers the tab you picked.

## Marking up an image

Open an image and draw on it. Each mark gets a number and a note box on the
right. Scroll to zoom in or out. To move around, right-click and drag: you go
back to the tool you were using when you let go. Or pick **Move** (the
hand) and drag with the left button. Write what should change at that spot. Use **Overall note** for
anything that isn't about one spot.

Your marks are listed on the right, and the overall note stays at the
bottom. Everything saves as you go.

When you're done with an image, press **Mark as reviewed**. If it's already
right, press **Approve**.

## When a new version comes back

The image comes back to you marked "Needs review". Press **Compare** (at
the end of the bar above the image, or the `\` key) to see your last marks
on the left and the new version on the right. The sidebar then shows what
you asked for last time, with the AI's answer under each mark (next to the
robot), and any note it added.

Compare has three views, picked in the bar that appears under it:

- **Side by side**: the last round, with your marks, next to the new one.
- **Overlay**: the new version on top of the last one. The slider sets how
  much of each you see.
- **Flicker**: swaps between the two every 200, 400 or 600 milliseconds, so
  small changes jump out. You can't draw while comparing;
press Compare again to go back to marking up. Then approve it, or mark it
up and go again.

To look closer, scroll to zoom in or out, and drag to move around. In
Compare, both images move together. **Fit** (the last button in the bar
above the image) puts everything back on screen.

Each time a new version comes back, that's a new round. Use the round
buttons at the bottom of the image to look at earlier rounds.

## Knowing when something's ready

When images start waiting for you (usually a new version from your AI),
Mimesis shows a notice with an **Open** button, and the tab's title shows
how many are waiting, like "(2) Mimesis". The first time you mark something
as reviewed, your browser asks whether Mimesis may send notifications; say
yes to get one from your computer while you're in another window.

## Finishing a review

**Finish review** works once every image is approved. Finished reviews
leave your list; **Show finished** brings them back.

## Deleting

Use the **⋯** menu next to a review's title or an image's name. Mimesis asks
before deleting anything.

## Shortcuts

| Key | Does |
| --- | --- |
| `v` | Select |
| `r` | Box |
| `o` | Circle |
| `a` | Arrow |
| `p` | Draw a line |
| `n` | Pin |
| `Delete` | Remove the selected mark |
| `⌘Z` / `Ctrl+Z` | Undo |
| `⇧⌘Z` / `Ctrl+Y` | Redo |
| `⌘↵` | Mark as reviewed |
| `←` / `→` | Previous or next image |
| Scroll | Zoom in or out |
| Right-click and drag | Move around, with any tool |
| `0` | Fit the image on screen |
| `\` | Turn Compare on or off |
