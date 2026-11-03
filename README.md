# Mimesis

Mimesis is a place for you and an AI to work on images together. You mark
up what should change, the AI sends back a new version, and you go back and
forth until you approve every image.

It works with any image: app screenshots, diagrams, generated art.

## How it works

**1. Start a review.** Drop images on the page, or have your AI add them.

![A review with three images waiting](web/public/guide/1-review.png)

**2. Mark what should change.** Draw boxes, circles, arrows, lines or pins.
Each mark gets a number and a note.

![Marking up a sign-up screen](web/public/guide/2-mark-up.png)

**3. Your AI picks it up.** It gets each image with your marks drawn on it
and your notes listed by number.

![The AI reading the marks from the terminal](web/public/guide/3-ai-pulls.png)

**4. Compare the new version.** Your marks are on the left and the new
version is on the right. Approve it, or mark it up again.

![Comparing the old and new sign-up screen](web/public/guide/4-compare.png)

**5. Finish.** Once every image is approved, finish the review.

![Every image approved](web/public/guide/5-finish.png)

The same steps are on the **Guide** tab in Mimesis.

## Install

You need [Rust](https://rustup.rs) and Node 18 or newer.

```sh
git clone https://github.com/joeboylson/mimesis.git
cd mimesis
./install.sh
```

This puts the `mimesis` command in `~/.local/bin`. To get the latest
version later, run `mimesis update`.

## Start

```sh
mimesis open
```

This opens Mimesis in your browser.

## More

- [Using Mimesis](docs/using-mimesis.md): marking up, statuses, shortcuts
- [For your AI](docs/for-your-ai.md): the commands your AI runs
- [Skills](skills/README.md): ready-made instructions that teach an AI how to work with Mimesis
- [Working on Mimesis](docs/working-on-mimesis.md): how the code is laid out, settings, and how to update the screenshots above
