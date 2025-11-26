// src/components/MultiSelect.tsx
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { ChevronDown, Search } from "lucide-react"

export type Option = { value: string; label: string }

type Props = {
  options: Option[]
  value: string[]
  onChange: (val: string[]) => void
  placeholder?: string
  emptyText?: string
  disabled?: boolean
  maxHeight?: number
}

export default function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Sélectionner…",
  emptyText = "Aucun résultat",
  disabled,
  maxHeight = 260,
}: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return options
    return options.filter(o => o.label.toLowerCase().includes(s))
  }, [options, q])

  const allSelected = value.length > 0 && value.length === options.length

  const toggle = (val: string) => {
    if (value.includes(val)) onChange(value.filter(v => v !== val))
    else onChange([...value, val])
  }

  const toggleAll = () => {
    if (allSelected) onChange([])
    else onChange(options.map(o => o.value))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" disabled={disabled} className="w-full justify-between">
          <div className="truncate text-left">
            {value.length === 0 && <span className="text-muted-foreground">{placeholder}</span>}
            {value.length === 1 && <span>{options.find(o => o.value === value[0])?.label ?? placeholder}</span>}
            {value.length > 1 && (
              <div className="flex items-center gap-1">
                <Badge variant="secondary">{value.length}</Badge>
                <span className="truncate">sélection(s)</span>
              </div>
            )}
          </div>
          <ChevronDown className="h-4 w-4 opacity-70" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[320px] p-2">
        <div className="flex items-center gap-2 mb-2">
          <div className="relative grow">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Rechercher…" className="pl-8" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <Button type="button" variant="outline" onClick={toggleAll} className="whitespace-nowrap">
            {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
          </Button>
        </div>

        <ScrollArea style={{ maxHeight }}>
          {filtered.length === 0 && (
            <div className="text-sm text-muted-foreground px-2 py-6 text-center">{emptyText}</div>
          )}
          <ul className="space-y-1">
            {filtered.map(o => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => toggle(o.value)}
                  className="w-full flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted"
                >
                  <Checkbox checked={value.includes(o.value)} />
                  <span className="text-sm truncate">{o.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={() => onChange([])}>Effacer</Button>
          <Button size="sm" onClick={() => setOpen(false)}>OK</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
