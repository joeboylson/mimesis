---
name: mimesis-ui
description: Take consistent screenshots of a UI (web app, Tauri/Electron window, iOS simulator, Android emulator), put them in a Mimesis review for the person to mark up, then fix what they marked and answer each one with a fresh screenshot, round after round until approved. Use when the user wants visual feedback on UI work, says "send it to mimesis", "let me mark it up", "screenshot the screens", or asks for a review loop on how something looks.
---

# mimesis-ui

The loop: **capture → `mimesis new` → person marks up → `mimesis pull` → fix the
code → recapture the same shot → `mimesis respond` → repeat until approved.**

The one rule that makes it work: **a recaptured shot must be taken exactly
like the first one** (same page, size, scale, theme, data, state), so the
only difference the person sees is your change. So capture from a script you
can run again, not by hand.

## 1. Get the app running

Find how the project starts (README, package.json scripts, Makefile,
CLAUDE.md) and start it in the background. Note the address. Use seeded or
fixed data where you can: a screenshot with a live clock, random avatars or
today's date changes every round and hides the real change.

## 2. Capture

### Web pages (most cases): the capture script

`capture.mjs` next to this file drives a headless browser from a shot list.
It fixes the things that make screenshots drift: 2× scale, no animations or
transitions, hidden text cursor, fonts loaded, network quiet.

One-time setup (shared by every project):

```sh
npm i --prefix ~/.mimesis/capture playwright && npx --prefix ~/.mimesis/capture playwright install chromium
```

Write the shot list in the project at `.mimesis/shots.json` (see
`shots.example.json` here). One entry per screen or state the person should
see:

```json
{
  "baseUrl": "http://localhost:5173",
  "out": ".mimesis/shots",
  "viewports": { "desktop": [1440, 900], "mobile": [390, 844] },
  "shots": [
    { "name": "login", "path": "/login", "waitFor": "text=Sign in" },
    { "name": "login-error", "path": "/login", "actions": [{ "click": "button[type=submit]" }], "waitFor": "[role=alert]" },
    { "name": "dashboard", "path": "/", "viewports": ["desktop"], "fullPage": true, "mask": [".last-updated"] }
  ]
}
```

```sh
node ~/.claude/skills/mimesis-ui/capture.mjs .mimesis/shots.json              # every shot
node ~/.claude/skills/mimesis-ui/capture.mjs .mimesis/shots.json --only login  # one shot, all its viewports
```

Files come out as `<name>-<viewport>.png` (plus `-dark` for `"colorSchemes":
["dark"]`). **That file name is how you find the shot again**: Mimesis shows it
as the item's name, and `mimesis pull` gives it back as `name`.

Shot options: `path`, `waitFor` (selector), `actions` (list of `click`,
`fill: [selector, text]`, `hover`, `press`, `wait` ms, `eval` JS), `fullPage`,
`clip` (selector to shoot one element), `hide` / `mask` (selectors for
content that changes on its own), `viewports`, `colorSchemes`, `baseUrl`
(this shot only). At the top: `"storageState": "path.json"` for signed-in
pages, `"permissions": ["clipboard-read", "clipboard-write"]` for copy
buttons.

Ask yourself which states the person needs to judge: empty, loading, error,
long text, open menus and modals, notices after an action, mobile. Each one
is a shot. Cover every kind of page, but only one of each: one list page,
one detail page, not a shot per record. Use one theme unless the person asks
for both.

Walk each workflow end to end and shoot the screens *between* the obvious
pages too: a step that only appears mid-flow (a compare view, an edit mode, a
confirmation, the page after saving) is the easiest to miss. Use states that
don't change the person's data; never click something that saves, sends or
deletes just to reach a screen.

Commit `.mimesis/shots.json` if the project wants it; add `.mimesis/shots/` to
`.gitignore`.

### Desktop windows (Tauri, Electron, native)

macOS, one window, no shadow, same size every time:

```sh
osascript -e 'tell application "System Events" to tell process "AppName" to set size of window 1 to {1440, 900}'
id=$(osascript -e 'tell application "System Events" to tell process "AppName" to get id of window 1' 2>/dev/null)
screencapture -o -x -l "$id" shot.png   # or: screencapture -o -x -R x,y,w,h shot.png
```

If the window id lookup fails, get it with `GetWindowID AppName` (brew
`smokris/getwindowid/getwindowid`) or fall back to `-R` with fixed bounds.
For a Tauri or Electron app that also runs in a browser, prefer the web route.

### Mobile

```sh
xcrun simctl status_bar booted override --time 9:41 --batteryLevel 100 --cellularBars 4   # once, steadies the status bar
xcrun simctl io booted screenshot shot.png                                                 # iOS simulator
adb shell settings put global sysui_demo_allowed 1 && adb shell am broadcast -a com.android.systemui.demo -e command enter
adb exec-out screencap -p > shot.png                                                       # Android
```

### Already have a browser tool?

If you're driving Chrome through an MCP browser tool, its screenshots work
too. Set the window size first and keep it fixed between rounds.

**Look at every image before you send it.** Read the PNGs. A blank page,
a spinner, a cookie banner or a login wall wastes the person's round.

## 3. Hand it to Mimesis

```sh
mimesis new "Checkout redesign" .mimesis/shots/*.png --json   # prints the review; note its id
mimesis open                                               # optional: opens the page for the person
```

Tell the person the review is ready and what to look at. Then wait:

```sh
mimesis wait --review <id> --json     # blocks until they send something back
```

Run `mimesis wait` in the background if you can, so you're free while they
mark up. They may send items one at a time or a whole batch at once.

New screens later on? `mimesis add <id> new-shot.png`.

## 4. Read what they asked for

```sh
mimesis pull --review <id>
```

For each waiting item this writes `~/.mimesis/out/item-<n>/round-<r>/`:

- `marked.png`: the shot with their marks drawn in, numbered, and every note
  listed underneath. **Look at it**; that's the request.
- `request.json`: the same notes as data, plus each mark's `area` in pixels
  `[left, top, right, bottom]` and the item's `name` (your shot file name).
- `original.png`: the shot without marks.

Marks are numbered in the order drawn. A mark with no note is pointing at
something: work out what from where it sits and the other notes. The
overall `note` applies to the whole shot. If a request really is ambiguous,
make your best reading and say what you assumed in your response note. Don't
stall the round.

Map the marked area to code: find the component on that page whose
on-screen position matches the area (scale ÷2 for the 2× capture), or search
for the visible text near it.

## 5. Fix, recapture, respond

1. Make the change in code.
2. Recapture **only that shot**, the same way as before:
   `node ~/.claude/skills/mimesis-ui/capture.mjs .mimesis/shots.json --only <name>`.
   (A shot name like `login` covers `login-desktop.png` and `login-mobile.png`;
   each is its own item.)
3. Look at the new PNG. Check every numbered mark was handled.
4. Answer the item:

```sh
mimesis respond <item_id> .mimesis/shots/login-desktop.png \
  -r "1=Widened the input to 480px" -r "2=Button uses --brand-green" \
  -n "Also added 24px more padding on the card."
```

Give one `-r` per mark, numbered to match: each reply shows under that
mark's note, so they can check them off one at a time. Keep them short. Use
`-n` only for anything that isn't about one mark. A fix that touched shared code may change other shots too:
recapture and respond to those as well (with a note saying why) rather than
let them go stale.

## 6. Loop until approved

Go back to `mimesis wait --review <id>`. You're done when
`mimesis show <id> --json` has every item's `state` as `approved`. Commit the
code changes as normal; the review keeps every round if anyone wants the
history.

## Checklist

- [ ] App running with steady data
- [ ] `.mimesis/shots.json` covers every screen and state that matters
- [ ] Looked at every capture before sending
- [ ] `mimesis new` → review id → told the person
- [ ] Per round: `wait` → `pull` → look at `marked.png` → fix → `--only` recapture → look → `respond` with a `-r` reply per mark
- [ ] All items approved
