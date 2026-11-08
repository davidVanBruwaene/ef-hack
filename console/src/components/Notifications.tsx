import { BellIcon, ChevronRightIcon } from 'lucide-react'
import type { Group } from '@/lib/groups'
import { initials, plural } from '@/lib/format'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

interface Props {
  groups: Group[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (key: string) => void
}

// The bell at the top right, and the drawer it opens.
export function Notifications({ groups, open, onOpenChange, onSelect }: Props) {
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        aria-label={groups.length > 0 ? `Notifications, ${plural(groups.length, 'new request')}` : 'Notifications'}
        onClick={() => onOpenChange(true)}
      >
        <BellIcon className="size-5" />
        {groups.length > 0 ? (
          <span className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold leading-none text-primary-foreground">
            {groups.length}
          </span>
        ) : null}
      </Button>

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Notifications</SheetTitle>
            <SheetDescription>Agents asking for access to what you keep behind "Ask me".</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {groups.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <div className="flex size-11 items-center justify-center rounded-full bg-muted">
                  <BellIcon className="size-5 text-muted-foreground" />
                </div>
                <div className="text-sm font-medium">No new requests</div>
                <p className="text-sm text-muted-foreground">New requests show up here as they arrive.</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {groups.map((g) => (
                  <li key={g.key}>
                    <button
                      onClick={() => onSelect(g.key)}
                      className="flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <Avatar>
                        <AvatarFallback>{initials(g.label)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{g.label}'s agent is asking for access</div>
                        <div className="truncate text-xs text-muted-foreground">{g.itemLabels.join(', ')}</div>
                        <Badge variant="secondary" className="mt-1.5">{plural(g.asks.length, 'item')}</Badge>
                      </div>
                      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
