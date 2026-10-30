import { BookOpen, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api, type Skill } from '@/lib/api'

// What to paste to an agent that should run the skill now.
const promptFor = (skill: Skill) =>
  `Use the ${skill.name} skill (if it isn't installed, run \`${skill.install_command}\` first, or read it with \`ochre skill show ${skill.id}\`). ` +
  `Make the images it describes for what I'm working on, put them in an Ochre review, and go round with me until I approve every one.`

function SkillCard({ skill }: { skill: Skill }) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="gap-0 py-0">
      <div className="grid gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-medium">{skill.name}</span>
          <span className="ml-auto text-xs text-muted-foreground">{skill.files.length} file{skill.files.length === 1 ? '' : 's'}</span>
        </div>
        <p className="text-sm text-muted-foreground">{skill.description}</p>
        <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 font-mono text-xs">
          <span className="flex-1 truncate">{skill.install_command}</span>
          <CopyButton text={skill.install_command} label="Copy" variant="ghost" />
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={promptFor(skill)} label="Copy prompt for an agent" />
          <CopyButton text={skill.content} label="Copy SKILL.md" />
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setOpen(true)}>
            <FileText />
            Read
          </Button>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-mono">{skill.name}</DialogTitle>
            <DialogDescription>{skill.files.join(' · ')}</DialogDescription>
          </DialogHeader>
          <pre className="min-h-0 flex-1 overflow-auto rounded-md bg-muted/50 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">{skill.content}</pre>
          <div className="flex justify-end gap-2">
            <CopyButton text={skill.content} label="Copy SKILL.md" />
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

export function SkillsPage({ version }: { version: number | null }) {
  const [skills, setSkills] = useState<Skill[] | null>(null)
  useEffect(() => {
    api.skills().then(setSkills)
  }, [version])
  return (
    <div className="mx-auto grid w-full max-w-4xl content-start gap-6 overflow-y-auto p-6">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">Skills</h1>
        <p className="text-sm text-muted-foreground">
          Guides that teach an AI agent to make a kind of image and run it through Ochre. Install one for Claude Code, or copy a prompt that tells
          an agent to use it.
        </p>
      </div>
      <div className="flex items-center gap-2 rounded-md border px-3 py-2 font-mono text-xs">
        <BookOpen className="size-3.5 text-muted-foreground" />
        <span className="flex-1">ochre skill install --all</span>
        <CopyButton text="ochre skill install --all" label="Copy" variant="ghost" />
      </div>
      <div className="grid gap-4">
        {(skills ?? []).map((skill) => (
          <SkillCard key={skill.id} skill={skill} />
        ))}
      </div>
    </div>
  )
}
