'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { Plus, ClipboardList, TrendingDown, TrendingUp, ChevronRight, Activity, HelpCircle, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'

export default function OpnamePage() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { selectedOutletId } = useOutlet()
  const supabase = createClient()

  const getStartOfWeekStr = (date: Date) => {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(d.setDate(diff))
    return format(monday, 'yyyy-MM-dd')
  }

  // Generate past 52 weeks (364 days + current week days = 371 days)
  const calendarDays = useMemo(() => {
    const days = []
    const today = new Date()
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - 364)
    // Align to Monday
    const dayOfWeek = startDate.getDay()
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    startDate.setDate(startDate.getDate() - diff)

    const current = new Date(startDate)
    for (let i = 0; i < 371; i++) {
      days.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }
    return days
  }, [])

  const currentWeekMondayStr = useMemo(() => {
    return getStartOfWeekStr(new Date())
  }, [])

  // Pre-process date checks for O(1) lookups
  const opnameDates = useMemo(() => {
    return new Set(logs.map(log => {
      try {
        return format(new Date(log.opname_date), 'yyyy-MM-dd')
      } catch (e) {
        return ''
      }
    }))
  }, [logs])

  const opnameWeeks = useMemo(() => {
    const weeks = new Set<string>()
    logs.forEach(log => {
      try {
        const dateStr = getStartOfWeekStr(new Date(log.opname_date))
        weeks.add(dateStr)
      } catch (e) {}
    })
    return weeks
  }, [logs])

  const renderMonthLabels = () => {
    const labels: { text: string; colSpan: number }[] = []
    let currentMonth = ''
    let count = 0

    for (let i = 0; i < calendarDays.length; i += 7) {
      const weekMonday = calendarDays[i]
      const monthName = format(weekMonday, 'MMM')
      
      if (monthName !== currentMonth) {
        if (count > 0) {
          labels[labels.length - 1].colSpan = count
        }
        labels.push({ text: monthName, colSpan: 1 })
        currentMonth = monthName
        count = 1
      } else {
        count++
      }
    }
    if (labels.length > 0) {
      labels[labels.length - 1].colSpan = count
    }

    return (
      <div className="flex text-[9px] text-zinc-500 font-bold uppercase tracking-wider pb-1" style={{ width: 'max-content' }}>
        {labels.map((lbl, idx) => (
          <div key={idx} className="flex-shrink-0" style={{ width: `${lbl.colSpan * 20}px` }}>
            {lbl.text}
          </div>
        ))}
      </div>
    )
  }

  useEffect(() => {
    if (!selectedOutletId) return

    async function fetchLogs() {
      setLoading(true)
      const { data, error } = await supabase
        .from('opname_log')
        .select(`
          *,
          item_master (
            name,
            unit
          )
        `)
        .eq('outlet_id', selectedOutletId)
        .order('opname_date', { ascending: false })

      if (!error && data) {
        setLogs(data)
      }
      setLoading(false)
    }

    fetchLogs()
  }, [selectedOutletId, supabase])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Stock Opname</h2>
          <p className="text-zinc-400 text-sm">Review weekly physical count history and variances.</p>
        </div>
        <Link href="/opname/new">
          <Button className="bg-zinc-100 text-zinc-900 hover:bg-zinc-200">
            <Plus className="mr-2 h-4 w-4" />
            New Physical Count
          </Button>
        </Link>
      </div>      {/* Stock Opname Tracker Card */}
      <Card className="border-zinc-800 bg-zinc-900/40 backdrop-blur-sm mb-6">
        <CardHeader className="py-4">
          <CardTitle className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-400" />
            Weekly Stock Opname Tracker
          </CardTitle>
          <CardDescription className="text-zinc-500 text-xs">
            Visual audit of your weekly count consistency. Completed weeks are highlighted in green, missed weeks in red.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-2">
          {loading ? (
            <div className="flex h-32 items-center justify-center text-zinc-500 text-xs">
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-zinc-500" />
              Loading tracker...
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start">
                {/* Day Labels */}
                <div className="flex flex-col justify-between text-[9px] text-zinc-500 font-bold pr-2.5 h-[134px] py-1 pt-[18px]">
                  <span>Mon</span>
                  <span>Wed</span>
                  <span>Fri</span>
                  <span>Sun</span>
                </div>
                
                {/* Grid Container */}
                <div className="flex-1 overflow-x-auto pb-2 scrollbar-thin">
                  {renderMonthLabels()}
                  <div className="grid grid-flow-col grid-rows-7 gap-1.5" style={{ width: 'max-content' }}>
                    {calendarDays.map((day, idx) => {
                      const dateStr = format(day, 'yyyy-MM-dd')
                      const weekStr = getStartOfWeekStr(day)
                      const isOpnameDay = opnameDates.has(dateStr)
                      const isOpnameWeek = opnameWeeks.has(weekStr)
                      
                      let colorClass = ''
                      let titleText = ''

                      if (isOpnameWeek) {
                        if (isOpnameDay) {
                          colorClass = 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.35)] border border-emerald-400/20'
                          titleText = `${format(day, 'dd MMM yyyy')}: Stock Opname Conducted!`
                        } else {
                          colorClass = 'bg-emerald-500/20 border border-emerald-500/30'
                          titleText = `${format(day, 'dd MMM yyyy')}: Week complete (Opname Conducted)`
                        }
                      } else {
                        // No opname in this week
                        if (weekStr > currentWeekMondayStr) {
                          // Future week
                          colorClass = 'bg-zinc-900 border border-zinc-800/40'
                          titleText = `${format(day, 'dd MMM yyyy')}: Future Week`
                        } else if (weekStr === currentWeekMondayStr) {
                          // Current week - no opname yet (Pending)
                          colorClass = 'bg-amber-500/10 border border-amber-500/25'
                          titleText = `${format(day, 'dd MMM yyyy')}: Current Week (Pending Opname Count)`
                        } else {
                          // Past week - no opname (Missed)
                          colorClass = 'bg-red-500/15 border border-red-500/25'
                          titleText = `${format(day, 'dd MMM yyyy')}: Missed Week (No Opname Conducted)`
                        }
                      }

                      return (
                        <div 
                          key={idx}
                          className={`w-3.5 h-3.5 rounded-sm transition-all duration-300 ${colorClass}`}
                          title={titleText}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Legend Footer */}
              <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-2 border-t border-zinc-800/40">
                <span className="flex items-center gap-1">
                  <HelpCircle className="h-3 w-3" />
                  Colors indicate count completion status of that week
                </span>
                <div className="flex items-center gap-1.5">
                  <span>Less</span>
                  <div className="w-3.5 h-3.5 rounded-sm bg-zinc-900 border border-zinc-800/40" title="Future Week" />
                  <div className="w-3.5 h-3.5 rounded-sm bg-red-500/15 border border-red-500/25" title="Missed Week (No Count)" />
                  <div className="w-3.5 h-3.5 rounded-sm bg-amber-500/10 border border-amber-500/25" title="Current Week (Pending)" />
                  <div className="w-3.5 h-3.5 rounded-sm bg-emerald-500/20 border border-emerald-500/30" title="Completed Week" />
                  <div className="w-3.5 h-3.5 rounded-sm bg-emerald-500 border border-emerald-400/20 shadow-[0_0_8px_rgba(16,185,129,0.35)]" title="Count Conducted" />
                  <span>More</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <Table>
          <TableHeader className="border-zinc-800">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-zinc-400">Opname Date</TableHead>
              <TableHead className="text-zinc-400">Item</TableHead>
              <TableHead className="text-zinc-400 text-right">System Qty</TableHead>
              <TableHead className="text-zinc-400 text-right">Physical Qty</TableHead>
              <TableHead className="text-zinc-400 text-right">Variance</TableHead>
              <TableHead className="text-zinc-400 text-right">Value Adjustment</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-zinc-500">
                  Loading opname history...
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-zinc-500">
                  No physical counts recorded yet.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id} className="border-zinc-800 hover:bg-zinc-800/30">
                  <TableCell className="text-zinc-300">
                    {format(new Date(log.opname_date), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-zinc-100">{log.item_master?.name}</span>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{log.item_master?.unit}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-zinc-400">
                    {log.system_qty}
                  </TableCell>
                  <TableCell className="text-right text-zinc-100 font-medium">
                    {log.physical_qty}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    <div className="flex items-center justify-end gap-1">
                      {log.variance > 0 ? (
                        <span className="text-emerald-500">+{log.variance}</span>
                      ) : log.variance < 0 ? (
                        <span className="text-red-500">{log.variance}</span>
                      ) : (
                        <span className="text-zinc-500">0</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <span className={log.variance_value >= 0 ? "text-emerald-500/80" : "text-red-500/80"}>
                      {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(log.variance_value || 0)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-zinc-700" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
