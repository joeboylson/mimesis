# ochre

A place for you and an AI to talk in pictures. Put a set of images in a
review, mark up what should change, and hand them all to the AI at once. It
answers each one with a new image. You see what you asked for next to what
came back, then approve it or mark it up again, round after round, until
it's right.

Ochre doesn't care where the images come from: generated art, UI
screenshots, diagrams, anything.

```
you: mark up ──► ochre ──► AI: ochre pull (image with marks drawn in + notes)
       ▲                                 │
       └──── compare, approve ◄── ochre respond <item> new.png
```

## Install

You need [Rust](https://rustup.rs) and Node 18+.

```sh
git clone https://github.com/joeboylson/ochre.git && cd ochre
./install.sh          # the ochre command, page included, into ~/.local/bin
./install.sh --app    # also the Ochre app, into ~/Applications (macOS; needs `cargo install tauri-cli`)
```

Update later with `ochre update` (or `./update.sh`): it pulls the latest
code and runs `install.sh` again. `./update.sh --app` updates the app too.

## Use it

```sh
ochre open            # the page in a browser; starts the server if it isn't running
```

Or open the Ochre app. Both show the same page.

- **Start a review**: drop images on the page, or have the AI run
  `ochre new "Title" a.png b.png`.
- **Mark up**: open an image and draw boxes, circles, arrows, lines, or
  pins. Each mark gets a number and a note. Add an overall note for anything
  that isn't about one spot. Everything saves as you go.
- **Send**: send one image (⌘↵), or mark up a whole batch and press
  **Send to AI** on the review to hand over every marked image at once.
- **Compare**: when the AI answers, the image comes back to you with your
  last round's marks on the left and the new image on the right. Approve
  it, or switch to **Mark up** and go again.

Keys on an image: `v` select, `r` box, `o` circle, `a` arrow, `p` draw,
`n` pin, `Delete` removes the selected mark, `⌘Z` / `⇧⌘Z` (or `Ctrl+Z` /
`Ctrl+Y`) undo and redo, `←`/`→` move between images.

## For the AI

`ochre guide` prints this for an agent. The short version:

```sh
ochre wait --review 3          # block until the person sends something back
ochre pull --review 3          # for each waiting image: marked.png, original, request.json
ochre respond 12 new.png -n "Widened the button, used the brand green"
```

`marked.png` has the marks drawn in, with numbered badges and the notes
listed under the image, so a model that only looks at pictures gets
everything. `request.json` has the same notes plus each mark's area in
pixels. Add `--json` to `inbox`, `pull`, `wait`, `list`, or `show` for
machine-readable output.

The server has the same over HTTP on `http://127.0.0.1:4620`:
`GET /api/inbox`, `GET /api/rounds/<id>/baked.png`, and
`POST /api/items/<id>/respond?note=…` with the image as the body.

## How it's built

- `crates/ochre`: the store (SQLite and image files in `~/.ochre`),
  drawing marks onto images, the local server, and the `ochre` command.
  The command works on the store directly, so it doesn't need the server.
- `web`: the page (React, Tailwind, shadcn/ui), embedded in the binary.
- `app/src-tauri`: the app, a window onto the same server.

`OCHRE_HOME` moves the store; `OCHRE_PORT` moves the server. The server
only answers this machine, and only pages it served itself.

Develop the page with `ochre serve` in one terminal and `cd web && npm run dev`
in another. Run the app from source with `cd app/src-tauri && cargo tauri dev`.
