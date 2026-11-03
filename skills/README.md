# Mimesis skills

Skills teach an AI agent (Claude Code, or anything that reads `SKILL.md`
files) how to make a kind of image and run it through Mimesis: capture or
generate, `mimesis new`, wait for marks, fix, `mimesis respond`, repeat until
approved.

Each folder here is one skill. They're built into the `mimesis` binary, so
any machine with mimesis installed can pull them:

```sh
mimesis skill list                 # what's available, and what's installed
mimesis skill show ui              # read one
mimesis skill install ui           # into ~/.claude/skills/mimesis-ui
mimesis skill install --all
```

`mimesis update` refreshes every skill you've installed.

| Skill | For |
| --- | --- |
| [`ui`](ui/SKILL.md) | Screenshots of a UI: web pages, desktop windows, mobile simulators |

## Adding one

1. Make a folder here named for the kind of image (`diagrams`,
   `image-gen`, `charts`, …).
2. Put a `SKILL.md` in it. Start the file with a `name:` line
   (`mimesis-<folder>`) and a `description:` line that says when to use it,
   between two `---` lines. Any scripts or examples go in the same folder
   and are installed with it.
3. Have it cover: how to make the images so a remake differs only by the
   requested change, how to name them (the file name is the item's name in
   Mimesis), and the Mimesis loop.
4. Add it to the table above, and run `./install.sh`.
