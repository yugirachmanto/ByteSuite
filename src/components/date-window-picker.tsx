'use client'

import React from 'react'
import { Calendar, ChevronDown } from 'lucide-react'
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
              <Calendar className="mr-2 h-4 w-4 text-zinc-500" />
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
            <div className="p-3 border-t border-zinc-800 mt-2 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
              <div className="space-y-1">
                <Label htmlFor="start-date" className="text-xs text-zinc-400">Start Date</Label>
                <Input
                  id="start-date"
                  type="date"
                  className="h-8 text-xs border-zinc-800 bg-zinc-900 text-zinc-200"
                  value={customDateRange.start ? format(customDateRange.start, 'yyyy-MM-dd') : ''}
                  onChange={(e) => setCustomDateRange({
                    ...customDateRange,
                    start: e.target.value ? new Date(e.target.value) : null
                  })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="end-date" className="text-xs text-zinc-400">End Date</Label>
                <Input
                  id="end-date"
                  type="date"
                  className="h-8 text-xs border-zinc-800 bg-zinc-900 text-zinc-200"
                  value={customDateRange.end ? format(customDateRange.end, 'yyyy-MM-dd') : ''}
                  onChange={(e) => setCustomDateRange({
                    ...customDateRange,
                    end: e.target.value ? new Date(e.target.value) : null
                  })}
                />
              </div>
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
