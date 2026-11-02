# mimesis

A place for you and an AI to talk in pictures. Put a set of images in a
review, mark up what should change, and finish the review. The AI picks
up what you reviewed with the `mimesis` command. It
answers each one with a new image. You see what you asked for next to what
came back, then approve it or mark it up again, round after round, until
it's right.

Mimesis doesn't care where the images come from: generated art, UI
screenshots, diagrams, anything.

```
you: mark up ──► mimesis ──► AI: mimesis pull (image with marks drawn in + notes)
       ▲                                 │
       └──── compare, approve ◄── mimesis respond <item> new.png
```

## Install

You need [Rust](https://rustup.rs) and Node 18+.

```sh
git clone https://github.com/joeboylson/mimesis.git && cd mimesis
./install.sh          # the mimesis command, page included, into ~/.local/bin
./install.sh --app    # also the Mimesis app, into ~/Applications (macOS; needs `cargo install tauri-cli`)
```

Update later with `mimesis update` (or `./update.sh`): it pulls the latest
code and runs `install.sh` again. `./update.sh --app` updates the app too.

## Use it

```sh
mimesis open            # the page in a browser; starts the server if it isn't running
```

Or open the Mimesis app. Both show the same page.

- **Start a review**: drop images on the page, or have the AI run
  `mimesis new "Title" a.png b.png`.
- **Mark up**: open an image and draw boxes, circles, arrows, lines, or
  pins. Each mark gets a number and a note. Add an overall note for anything
  that isn't about one spot. Everything saves as you go.
- **Finish**: mark one image as reviewed (⌘↵), or mark up a whole batch
  and press **Finish review** to mark every marked-up image as reviewed.
  Mimesis only holds the images; your agent picks them up with `mimesis pull`.
- **Compare**: when a new version is added, the image comes back to you with your
  last round's marks on the left and the new image on the right. Approve
  it, or switch to **Mark up** and go again.

Keys on an image: `v` select, `r` box, `o` circle, `a` arrow, `p` draw,
`n` pin, `Delete` removes the selected mark, `⌘Z` / `⇧⌘Z` (or `Ctrl+Z` /
`Ctrl+Y`) undo and redo, `←`/`→` move between images.

## For the AI

`mimesis guide` prints this for an agent. The short version:

```sh
mimesis wait --review 3          # block until the person finishes reviewing something
mimesis pull --review 3          # for each waiting image: marked.png, original, request.json
mimesis respond 12 new.png -n "Widened the button, used the brand green"
```

`marked.png` has the marks drawn in, with numbered badges and the notes
listed under the image, so a model that only looks at pictures gets
everything. `request.json` has the same notes plus each mark's area in
pixels. Add `--json` to `inbox`, `pull`, `wait`, `list`, or `show` for
machine-readable output.

The server has the same over HTTP on `http://127.0.0.1:4620`:
`GET /api/inbox`, `GET /api/rounds/<id>/baked.png`, and
`POST /api/items/<id>/respond?note=…` with the image as the body.

## Skills

Skills teach an agent how to make a kind of image so a remake differs only
by what you asked for, and how to run it through Mimesis. They live in
[`skills/`](skills/README.md), are built into `mimesis`, and show on the
page's **Skills** tab with copy buttons.

```sh
mimesis skill list
mimesis skill install ui     # ~/.claude/skills/mimesis-ui: UI screenshots → Mimesis → fix → repeat
```

`mimesis update` refreshes installed skills.

## How it's built

- `crates/mimesis`: the store (SQLite and image files in `~/.mimesis`),
  drawing marks onto images, the local server, and the `mimesis` command.
  The command works on the store directly, so it doesn't need the server.
- `web`: the page (React, Tailwind, shadcn/ui), embedded in the binary.
- `app/src-tauri`: the app, a window onto the same server.

`MIMESIS_HOME` moves the store; `MIMESIS_PORT` moves the server. The server
only answers this machine, and only pages it served itself.

Develop the page with `mimesis serve` in one terminal and `cd web && npm run dev`
in another. Run the app from source with `cd app/src-tauri && cargo tauri dev`.
