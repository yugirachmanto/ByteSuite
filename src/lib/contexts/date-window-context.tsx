'use client'

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react'
import { subDays, subWeeks, subMonths, subQuarters, subYears, startOfDay, endOfDay } from 'date-fns'

export type DatePeriod = '1D' | '1W' | '1M' | '1Q' | '1Y' | 'CUSTOM'

interface DateWindowContextType {
  period: DatePeriod
  setPeriod: (period: DatePeriod) => void
  customDateRange: { start: Date | null; end: Date | null }
  setCustomDateRange: (range: { start: Date | null; end: Date | null }) => void
  startDate: Date
  endDate: Date
}

const DateWindowContext = createContext<DateWindowContextType | undefined>(undefined)

export function DateWindowProvider({ children }: { children: React.ReactNode }) {
  const [period, setPeriod] = useState<DatePeriod>('1M')
  const [customDateRange, setCustomDateRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null,
  })
  
  // Load initial from localStorage if available
  useEffect(() => {
    try {
      const storedPeriod = localStorage.getItem('erp_date_period') as DatePeriod | null
      if (storedPeriod) {
        setPeriod(storedPeriod)
      }
      
      const storedCustom = localStorage.getItem('erp_custom_date_range')
      if (storedCustom) {
        const parsed = JSON.parse(storedCustom)
        setCustomDateRange({
          start: parsed.start ? new Date(parsed.start) : null,
          end: parsed.end ? new Date(parsed.end) : null,
        })
      }
    } catch (e) {
      console.error('Failed to parse stored date preferences', e)
    }
  }, [])

  // Persist when changes happen
  useEffect(() => {
    localStorage.setItem('erp_date_period', period)
  }, [period])
  
  useEffect(() => {
    if (period === 'CUSTOM') {
      localStorage.setItem('erp_custom_date_range', JSON.stringify({
         start: customDateRange.start?.toISOString() || null,
         end: customDateRange.end?.toISOString() || null
      }))
    }
  }, [customDateRange, period])

  // Compute dates based on period and "today"
  const { startDate, endDate } = useMemo(() => {
    const end = endOfDay(new Date()) // Always today for predefined periods
    let start: Date
    
    switch (period) {
      case '1D':
        start = startOfDay(new Date())
        break
      case '1W':
        start = startOfDay(subWeeks(new Date(), 1))
        break
      case '1M':
        start = startOfDay(subMonths(new Date(), 1))
        break
      case '1Q':
        start = startOfDay(subQuarters(new Date(), 1))
        break
      case '1Y':
        start = startOfDay(subYears(new Date(), 1))
        break
      case 'CUSTOM':
        start = customDateRange.start ? startOfDay(customDateRange.start) : startOfDay(subMonths(new Date(), 1))
        const customEnd = customDateRange.end ? endOfDay(customDateRange.end) : endOfDay(new Date())
        return { startDate: start, endDate: customEnd }
      default:
        start = startOfDay(subMonths(new Date(), 1))
    }
    
    return { startDate: start, endDate: end }
  }, [period, customDateRange])

  return (
    <DateWindowContext.Provider value={{
      period, setPeriod, customDateRange, setCustomDateRange, startDate, endDate
    }}>
      {children}
    </DateWindowContext.Provider>
  )
}

export function useDateWindow() {
  const context = useContext(DateWindowContext)
  if (context === undefined) {
    throw new Error('useDateWindow must be used within a DateWindowProvider')
  }
  return context
}
