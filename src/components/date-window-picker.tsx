'use client'

import React from 'react'
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react'
import { format } from 'date-fns'
import { useDateWindow, DatePeriod } from '@/lib/contexts/date-window-context'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'

const PERIOD_LABELS: Record<DatePeriod, string> = {
  '1D': 'Today',
  '1W': 'Last 7 Days',
  '1M': 'Last 30 Days',
  '1Q': 'Last Quarter',
  '1Y': 'Last Year',
  'CUSTOM': 'Custom Range'
}

export function DateWindowPicker() {
  const { period, setPeriod, customDateRange, setCustomDateRange, startDate, endDate } = useDateWindow()

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'h-8 border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100'
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4 text-zinc-500" />
              <span className="mr-2 font-medium">{PERIOD_LABELS[period]}</span>
              <span className="text-xs text-zinc-500 hidden sm:inline-block">
                ({format(startDate, 'MMM d, yyyy')} - {format(endDate, 'MMM d, yyyy')})
              </span>
              <ChevronDown className="ml-2 h-4 w-4 text-zinc-500" />
            </button>
          }
        />
        <DropdownMenuContent align="end" className="w-56 border-zinc-800 bg-zinc-950 text-zinc-300">
          {(Object.entries(PERIOD_LABELS) as [DatePeriod, string][]).map(([key, label]) => {
            if (key === 'CUSTOM') return null // Handle separately
            return (
              <DropdownMenuItem
                key={key}
                className={`cursor-pointer ${period === key ? 'bg-zinc-800 text-zinc-100' : 'hover:bg-zinc-900'}`}
                onClick={() => setPeriod(key)}
              >
                {label}
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator className="bg-zinc-800" />
          <DropdownMenuItem
            className={`cursor-pointer ${period === 'CUSTOM' ? 'bg-zinc-800 text-zinc-100' : 'hover:bg-zinc-900'}`}
            onClick={(e) => {
               // don't close if they are clicking custom range so they can use the inputs
               e.preventDefault() 
               setPeriod('CUSTOM')
            }}
          >
            Custom Range...
          </DropdownMenuItem>
          
          {period === 'CUSTOM' && (
            <div className="p-3 border-t border-zinc-800 mt-2" onClick={(e) => e.stopPropagation()}>
              <Calendar
                mode="range"
                selected={{
                  from: customDateRange.start || undefined,
                  to: customDateRange.end || undefined,
                }}
                onSelect={(range) => {
                  setCustomDateRange({
                    start: range?.from || null,
                    end: range?.to || null
                  })
                }}
                numberOfMonths={2}
                className="bg-zinc-950 border-zinc-800 text-zinc-300 rounded-md"
              />
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
