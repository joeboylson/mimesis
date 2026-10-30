# Ochre skills

Skills teach an AI agent (Claude Code, or anything that reads `SKILL.md`
files) how to make a kind of image and run it through Ochre: capture or
generate, `ochre new`, wait for marks, fix, `ochre respond`, repeat until
approved.

Each folder here is one skill. They're built into the `ochre` binary, so
any machine with ochre installed can pull them:

```sh
ochre skill list                 # what's available, and what's installed
ochre skill show ui              # read one
ochre skill install ui           # into ~/.claude/skills/ochre-ui
ochre skill install --all
```

`ochre update` refreshes every skill you've installed.

| Skill | For |
| --- | --- |
| [`ui`](ui/SKILL.md) | Screenshots of a UI: web pages, desktop windows, mobile simulators |

## Adding one

1. Make a folder here named for the kind of image (`diagrams`,
   `image-gen`, `charts`, …).
2. Put a `SKILL.md` in it with front matter: `name: ochre-<folder>` and a
   `description` that says when to use it. Supporting files (scripts,
   examples) go beside it and are installed with it.
3. Have it cover: how to make the images so a remake differs only by the
   requested change, how to name them (the file name is the item's name in
   Ochre), and the Ochre loop.
4. Add it to the table above, and run `./install.sh`.
