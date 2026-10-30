import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text)
  // Older webviews: the selection-and-copy way.
  const area = document.createElement('textarea')
  area.value = text
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  const copied = document.execCommand('copy')
  area.remove()
  if (!copied) throw new Error("Couldn't copy")
}

export function CopyButton({
  text,
  label,
  variant = 'outline',
  iconOnly = false,
}: {
  text: string
  label: string
  variant?: 'outline' | 'ghost' | 'default' | 'secondary'
  iconOnly?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const copy = () =>
    copyText(text)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch((e) => toast.error(e.message))
  if (iconOnly)
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant={variant} size="icon-sm" aria-label={label} onClick={copy}>
            {copied ? <Check /> : <Copy />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{copied ? 'Copied' : label}</TooltipContent>
      </Tooltip>
    )
  return (
    <Button variant={variant} size="sm" onClick={copy}>
      {copied ? <Check /> : <Copy />}
      {copied ? 'Copied' : label}
    </Button>
  )
}
