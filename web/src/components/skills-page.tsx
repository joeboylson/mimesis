import { BookOpen, ChevronDown } from 'lucide-react'
import { useEffect, useState } from 'react'

import { CopyButton } from '@/components/copy-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { api, type Skill } from '@/lib/api'
import { cn } from '@/lib/utils'

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
          {skill.installed ? <Badge variant="secondary">Installed</Badge> : <Badge variant="outline">Not installed</Badge>}
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
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setOpen(!open)}>
            {open ? 'Hide' : 'Read'}
            <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
          </Button>
        </div>
      </div>
      {open && <pre className="max-h-[60vh] overflow-auto border-t bg-muted/30 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">{skill.content}</pre>}
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
