"use client"

import { useState } from "react"
import { format, parse, isValid } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { Calendar } from "./calendar"
import { cn } from "@/lib/utils"

interface DatePickerProps {
  value?: string | null
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function DatePicker({ value, onChange, placeholder = "Select date…", className, disabled }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const parsedDate = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined
  const selectedDate = parsedDate && isValid(parsedDate) ? parsedDate : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-sm text-left transition-colors focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed",
          selectedDate ? "text-zinc-100" : "text-zinc-600",
          className
        )}
      >
        <CalendarIcon className="h-4 w-4 text-zinc-500 shrink-0" />
        <span className="truncate">{selectedDate ? format(selectedDate, "dd MMM yyyy") : placeholder}</span>
      </PopoverTrigger>
      <PopoverContent className="p-0 bg-zinc-950 border-zinc-800" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (date) {
              onChange(format(date, "yyyy-MM-dd"))
              setOpen(false)
            }
          }}
          className="bg-zinc-950 border-0 text-zinc-100"
        />
      </PopoverContent>
    </Popover>
  )
}
