# Working on Mimesis

## How the code is laid out

| Folder | What's in it |
| --- | --- |
| `crates/mimesis` | The `mimesis` command and the local server, written in Rust. It keeps reviews and images in `~/.mimesis` and draws marks onto images. |
| `web` | The page you see in the browser (React and Tailwind). It's built into the `mimesis` command. |
| `app/src-tauri` | The desktop app. It's a window that shows the same page. |
| `skills` | Instructions for AIs, built into the `mimesis` command. See [skills](../skills/README.md). |
| `guide` | The script that takes the screenshots for the README and the Guide tab. |
| `docs` | These pages. |

The `mimesis` command reads and writes `~/.mimesis` itself, so it works
whether or not the server is running.

## Settings

| Setting | Default | Does |
| --- | --- | --- |
| `MIMESIS_HOME` | `~/.mimesis` | Where reviews and images are kept |
| `MIMESIS_PORT` | `4620` | The port the server uses |

The server only answers requests from this computer.

## Installing your changes

```sh
./install.sh          # rebuild and install the mimesis command
./install.sh --app    # also the desktop app, into ~/Applications (macOS; needs `cargo install tauri-cli`)
```

`mimesis update` (or `./update.sh`) pulls the latest code first, then does
the same. `./update.sh --app` updates the app too.

## Working on the page

Run these in two terminals, and the page reloads as you edit:

```sh
mimesis serve
cd web && npm run dev
```

To run the desktop app from the code: `cd app/src-tauri && cargo tauri dev`.

## Updating the screenshots

The screenshots in the README and on the Guide tab come from a script. It
starts its own copy of Mimesis with an empty folder, walks a made-up review
through every step, and saves a screenshot of each one. None of your own
reviews show up in them.

Run it after you change how the screens look:

```sh
cd web
npm run guide    # retakes the screenshots into web/public/guide
npm run build    # puts them in the page
```

It needs Playwright, set up once with:

```sh
npm i --prefix ~/.mimesis/capture playwright
npx --prefix ~/.mimesis/capture playwright install chromium
```

To change what's shown, edit `guide/shoot.mjs` for the screenshots and
`web/src/components/guide-page.tsx` for the words on the Guide tab.
