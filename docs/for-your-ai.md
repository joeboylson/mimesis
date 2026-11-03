# For your AI

Your AI works with Mimesis through the `mimesis` command. It doesn't need
the browser open. Running `mimesis guide` prints these instructions for the
AI to read.

## The usual loop

```sh
mimesis new "Sign-up screen" a.png b.png    # start a review; prints its number
mimesis wait --review 3                     # wait until you've marked something up
mimesis pull --review 3                     # save what you marked to a folder
mimesis respond 12 new.png -n "1: made the button green"   # send a new version of image 12
```

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

## Over the network

When Mimesis is open, the same things are available at
`http://127.0.0.1:4620`, from this computer only:

- `GET /api/inbox`: images waiting for a new version
- `GET /api/rounds/<id>/baked.png`: an image with its marks drawn on it
- `POST /api/items/<id>/respond?note=…`: send a new version, with the
  image as the body

## Skills

Skills are ready-made instructions for an AI, like how to take screenshots
of an app the same way each time. See [skills](../skills/README.md).
