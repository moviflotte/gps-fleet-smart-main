// src/components/DateRangePicker.tsx
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Calendar, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface DateRangePickerProps {
  onRangeChange?: (from: Date, to: Date) => void
  defaultRange?: { from: Date; to: Date }
  storageKey?: string
  showQuickFilters?: boolean
  className?: string
}

function toIsoLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function defaultRange() {
  const to = new Date()
  const from = new Date(to.getTime() - 24 * 60 * 60 * 1000)
  return { from, to }
}

export function DateRangePicker({
  onRangeChange,
  defaultRange: customDefaultRange,
  storageKey = "dateRange",
  showQuickFilters = true,
  className,
}: DateRangePickerProps) {
  const [showCalendar, setShowCalendar] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedStart, setSelectedStart] = useState<Date | null>(null)
  const [lastClickedDate, setLastClickedDate] = useState<{ date: Date; time: number } | null>(null)
  
  // Période contrôlée
  const getInitialRange = () => {
    if (storageKey) {
      const f = localStorage.getItem(`${storageKey}From`)
      const t = localStorage.getItem(`${storageKey}To`)
      if (f && t) return { from: new Date(f), to: new Date(t) }
    }
    return customDefaultRange || defaultRange()
  }

  const initial = getInitialRange()
  const [fromLocal, setFromLocal] = useState<string>(toIsoLocalValue(initial.from))
  const [toLocal, setToLocal] = useState<string>(toIsoLocalValue(initial.to))
  const [range, setRange] = useState<{ from: Date; to: Date }>(initial)
  const [rangeError, setRangeError] = useState<string | null>(null)

  const saveRange = (from: Date, to: Date) => {
    if (storageKey) {
      localStorage.setItem(`${storageKey}From`, from.toISOString())
      localStorage.setItem(`${storageKey}To`, to.toISOString())
    }
    setRange({ from, to })
    onRangeChange?.(from, to)
  }

  const applyRange = () => {
    setRangeError(null)
    const f = new Date(fromLocal)
    const t = new Date(toLocal)
    if (Number.isNaN(+f) || Number.isNaN(+t)) {
      setRangeError("Dates invalides")
      return
    }
    if (+f >= +t) {
      setRangeError("La date de début doit être avant la date de fin")
      return
    }
    saveRange(f, t)
    setShowCalendar(false)
  }

  const setLast24h = () => {
    const to = new Date()
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000)
    setFromLocal(toIsoLocalValue(from))
    setToLocal(toIsoLocalValue(to))
    saveRange(from, to)
    setShowCalendar(false)
  }

  const setLast7d = () => {
    const to = new Date()
    const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000)
    setFromLocal(toIsoLocalValue(from))
    setToLocal(toIsoLocalValue(to))
    saveRange(from, to)
    setShowCalendar(false)
  }

  const setLast30d = () => {
    const to = new Date()
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000)
    setFromLocal(toIsoLocalValue(from))
    setToLocal(toIsoLocalValue(to))
    saveRange(from, to)
    setShowCalendar(false)
  }

  // Génération du calendrier
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    const days: (Date | null)[] = []
    
    // Jours du mois précédent
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }
    
    // Jours du mois actuel
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i))
    }
    
    return days
  }

  const handleDateClick = (date: Date) => {
    const now = Date.now()
    
    // Détection du double-clic (dans les 300ms)
    if (lastClickedDate && 
        lastClickedDate.date.toDateString() === date.toDateString() &&
        now - lastClickedDate.time < 300) {
      // Double-clic : sélectionner toute la journée
      const from = new Date(date)
      from.setHours(0, 0, 0, 0)
      
      const to = new Date(date)
      to.setHours(23, 59, 59, 999)
      
      setFromLocal(toIsoLocalValue(from))
      setToLocal(toIsoLocalValue(to))
      saveRange(from, to)
      setSelectedStart(null)
      setLastClickedDate(null)
      setShowCalendar(false)
      return
    }
    
    // Simple clic
    setLastClickedDate({ date, time: now })
    
    if (!selectedStart) {
      // Premier clic : début de la plage
      const from = new Date(date)
      from.setHours(0, 0, 0, 0)
      setSelectedStart(from)
      setFromLocal(toIsoLocalValue(from))
    } else {
      // Deuxième clic : fin de la plage
      const from = selectedStart
      const to = new Date(date)
      to.setHours(23, 59, 59, 999)
      
      if (to < from) {
        // Inverser si nécessaire
        setFromLocal(toIsoLocalValue(to))
        setToLocal(toIsoLocalValue(from))
        saveRange(to, from)
      } else {
        setFromLocal(toIsoLocalValue(from))
        setToLocal(toIsoLocalValue(to))
        saveRange(from, to)
      }
      
      setSelectedStart(null)
      setShowCalendar(false)
    }
  }

  const isDateInRange = (date: Date) => {
    if (!selectedStart) return false
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    return d >= selectedStart
  }

  const isDateSelected = (date: Date) => {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    const rangeFrom = new Date(range.from)
    rangeFrom.setHours(0, 0, 0, 0)
    const rangeTo = new Date(range.to)
    rangeTo.setHours(0, 0, 0, 0)
    
    return d >= rangeFrom && d <= rangeTo
  }

  const monthNames = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
  ]

  const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"]

  const days = getDaysInMonth(currentMonth)

  return (
    <div className={cn("relative", className)}>
      <div className="flex flex-col md:flex-row md:items-end gap-2">
        {/* Champs de saisie */}
        <div className="flex gap-2">
          <div>
            <label className="block text-xs mb-1 font-medium">De</label>
            <Input
              type="datetime-local"
              value={fromLocal}
              onChange={(e) => setFromLocal(e.target.value)}
              className="w-48"
            />
          </div>
          <div>
            <label className="block text-xs mb-1 font-medium">À</label>
            <Input
              type="datetime-local"
              value={toLocal}
              onChange={(e) => setToLocal(e.target.value)}
              className="w-48"
            />
          </div>
        </div>

        {/* Boutons d'action */}
        <div className="flex gap-2">
          <Button
            onClick={() => setShowCalendar(!showCalendar)}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Calendar className="h-4 w-4" />
            Calendrier
          </Button>
          
          <Button onClick={applyRange} className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Appliquer
          </Button>

          {showQuickFilters && (
            <>
              <Button variant="outline" onClick={setLast24h}>
                24h
              </Button>
              <Button variant="outline" onClick={setLast7d}>
                7j
              </Button>
              <Button variant="outline" onClick={setLast30d}>
                30j
              </Button>
            </>
          )}
        </div>
      </div>

      {rangeError && (
        <p className="text-xs text-red-600 mt-1">{rangeError}</p>
      )}

      {/* Calendrier déroulant */}
      {showCalendar && (
        <Card className="absolute top-full left-0 mt-2 z-50 shadow-lg">
          <CardContent className="p-4">
            {/* En-tête du calendrier */}
            <div className="flex items-center justify-between mb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const prev = new Date(currentMonth)
                  prev.setMonth(prev.getMonth() - 1)
                  setCurrentMonth(prev)
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <span className="font-semibold">
                {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </span>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const next = new Date(currentMonth)
                  next.setMonth(next.getMonth() + 1)
                  setCurrentMonth(next)
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Aide */}
            <p className="text-xs text-gray-500 mb-2 text-center">
              Double-cliquez pour sélectionner une journée complète
            </p>

            {/* Grille du calendrier */}
            <div className="grid grid-cols-7 gap-1">
              {/* Jours de la semaine */}
              {dayNames.map((day) => (
                <div
                  key={day}
                  className="text-center text-xs font-medium text-gray-500 p-2"
                >
                  {day}
                </div>
              ))}

              {/* Jours du mois */}
              {days.map((day, index) => {
                if (!day) {
                  return <div key={`empty-${index}`} className="p-2" />
                }

                const isSelected = isDateSelected(day)
                const isInRange = isDateInRange(day)
                const isToday = day.toDateString() === new Date().toDateString()

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => handleDateClick(day)}
                    className={cn(
                      "p-2 text-sm rounded hover:bg-gray-100 transition-colors",
                      isSelected && "bg-blue-500 text-white hover:bg-blue-600",
                      isInRange && !isSelected && "bg-blue-100",
                      isToday && !isSelected && "border border-blue-500",
                      "cursor-pointer"
                    )}
                  >
                    {day.getDate()}
                  </button>
                )
              })}
            </div>

            {selectedStart && (
              <p className="text-xs text-gray-500 mt-2 text-center">
                Sélectionnez la date de fin
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}