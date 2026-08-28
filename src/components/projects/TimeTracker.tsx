'use client'

import { useState, useEffect, useRef } from 'react'
import { Timer, Play, Square } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

interface TimeEntry {
  id: string
  started_at: string
  ended_at: string | null
  duration_minutes: number | null
}

interface TimeTrackerProps {
  taskId: string
  outletId: string
  onLogged?: () => void
}

function formatMinutes(mins: number) {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function TimeTracker({ taskId, outletId, onLogged }: TimeTrackerProps) {
  const supabase = createClient()
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const runningEntry = entries.find((e) => !e.ended_at) || null

  const fetchEntries = async () => {
    const { data, error } = await supabase
      .from('pm_time_entries')
      .select('*')
      .eq('task_id', taskId)
      .order('started_at', { ascending: false })

    if (error) {
      console.error('Fetch time entries error:', error.message)
    } else {
      setEntries(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchEntries()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current)
    if (runningEntry) {
      const update = () => setElapsed(Math.floor((Date.now() - new Date(runningEntry.started_at).getTime()) / 60000))
      update()
      tickRef.current = setInterval(update, 15000)
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningEntry?.id])

  const handleStart = async () => {
    if (runningEntry || starting) return
    setStarting(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setStarting(false)
      return
    }

    const { error } = await supabase
      .from('pm_time_entries')
      .insert({
        task_id: taskId,
        outlet_id: outletId,
        user_id: user.id,
        started_at: new Date().toISOString(),
      })

    setStarting(false)
    if (!error) fetchEntries()
  }

  const handleStop = async () => {
    if (!runningEntry) return
    const endedAt = new Date()
    const durationMinutes = Math.max(1, Math.round((endedAt.getTime() - new Date(runningEntry.started_at).getTime()) / 60000))

    const { error } = await supabase
      .from('pm_time_entries')
      .update({ ended_at: endedAt.toISOString(), duration_minutes: durationMinutes })
      .eq('id', runningEntry.id)

    if (!error) {
      fetchEntries()
      onLogged?.()
    }
  }

  const totalMinutes = entries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0)

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
          <Timer className="h-4 w-4 text-indigo-400" />
          Pelacakan Waktu {totalMinutes > 0 && <span className="text-zinc-500 font-normal">({formatMinutes(totalMinutes)} total)</span>}
        </span>
        {runningEntry ? (
          <Button
            size="sm"
            onClick={handleStop}
            className="bg-rose-600 hover:bg-rose-500 text-white text-xs gap-1.5 h-7"
          >
            <Square className="h-3 w-3" />
            Stop ({formatMinutes(elapsed)})
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleStart}
            disabled={starting}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5 h-7"
          >
            <Play className="h-3 w-3" />
            Mulai
          </Button>
        )}
      </div>

      {!loading && entries.filter((e) => e.ended_at).length > 0 && (
        <div className="space-y-1">
          {entries.filter((e) => e.ended_at).slice(0, 5).map((entry) => (
            <div key={entry.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 px-2.5 py-1.5 rounded-lg text-[11px]">
              <span className="text-zinc-400">
                {new Date(entry.started_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
              </span>
              <span className="text-zinc-200 font-mono">{formatMinutes(entry.duration_minutes || 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
