# For your AI

Your AI works with Mimesis through the `mimesis` command. It doesn't need
the browser open. Running `mimesis guide` prints these instructions for the
AI to read.

## The usual loop

```sh
mimesis new "Sign-up screen" a.png b.png    # start a review; prints its number
mimesis wait --review 3                     # wait until you've marked something up
mimesis pull --review 3                     # save what you marked to a folder
mimesis respond 12 new.png -r "1=Made the button green"   # send a new version of image 12
```

`-r` answers one of your marks by its number, and shows under that mark's
note. Your AI gives one per mark. `-n` adds a note that isn't about one
mark.

Then it runs `mimesis wait` again, until you've approved every image.

## What `mimesis pull` gives the AI

For each image you marked up, a folder with:

- `marked.png`: the image with your marks drawn on it, each with its
  number, and your notes listed under the image by number. An AI that only
  looks at pictures still gets everything.
- `original.png`: the image without marks.
- `request.json`: the same notes, plus where each mark is in pixels.

## Other commands

| Command | Does |
| --- | --- |
| `mimesis add <review> c.png` | Add more images to a review |
| `mimesis list` | List reviews |
| `mimesis show <review>` | Show where each image in a review stands |
| `mimesis inbox` | List images waiting for a new version |
| `mimesis approve <image>` | Approve an image |

Add `--json` to `list`, `show`, `inbox`, `pull` or `wait` to get output a
program can read.

## Folders and preferences

Each folder keeps a short list of how you like things made, distilled from
the notes in its reviews. Your AI should read it before changing a UI:

```sh
mimesis folder use "Myserve.ai"     # once per project: link it to a folder
mimesis prefs                       # then, before each piece of UI work
```

To keep the list current, your AI reads every note in a folder and saves a
new list:

```sh
mimesis folder notes "Myserve.ai"
mimesis folder prefs "Myserve.ai" --set prefs.md
```

| Command | Does |
| --- | --- |
| `mimesis folder list` | List folders |
| `mimesis folder new <name>` | Make a folder |
| `mimesis folder move <review> <folder>` | Put a review in a folder (`none` takes it out) |
| `mimesis new "Title" a.png --folder <name>` | Start a review in a folder |

## Over the network

When Mimesis is open, the same things are available at
`http://127.0.0.1:4620`, from this computer only:

- `GET /api/inbox`: images waiting for a new version
- `GET /api/rounds/<id>/baked.png`: an image with its marks drawn on it
- `POST /api/items/<id>/respond?note=…&replies={"1":"…"}`: send a new
  version, with the image as the body. `replies` answers marks by number.

## Skills

Skills are ready-made instructions for an AI, like how to take screenshots
of an app the same way each time. See [skills](../skills/README.md).
