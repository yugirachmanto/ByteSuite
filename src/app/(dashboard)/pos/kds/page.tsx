'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { Loader2, Volume2, VolumeX, Maximize, Minimize, Check, RotateCcw, BellRing, ChefHat, GlassWater } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

type Station = 'kitchen' | 'bar'

interface KdsItem { name: string; qty: number; note: string | null }
interface KdsTicket {
  ticket_id: string
  order_id: string
  order_no: string
  station: Station
  status: 'new' | 'done'
  created_at: string
  done_at: string | null
  items: KdsItem[]
}

const POLL_MS = 8000
const STORAGE_STATION = 'bytesuite_kds_station'

function elapsed(fromIso: string, nowMs: number) {
  const s = Math.max(0, Math.floor((nowMs - new Date(fromIso).getTime()) / 1000))
  return { s, label: `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
}

// Green -> amber -> red as a ticket waits longer.
function ageStyle(seconds: number) {
  if (seconds >= 600) return 'border-red-500/70 bg-red-950/30'
  if (seconds >= 300) return 'border-amber-500/70 bg-amber-950/20'
  return 'border-emerald-600/60 bg-zinc-900'
}

export default function KitchenDisplayPage() {
  const supabase = createClient()
  const { selectedOutletId, outlets } = useOutlet()
  const [station, setStation] = useState<Station>('kitchen')
  const [tickets, setTickets] = useState<KdsTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [showDone, setShowDone] = useState(false)
  const [soundOn, setSoundOn] = useState(false)
  const [audioReady, setAudioReady] = useState(false)
  const [flash, setFlash] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const audioRef = useRef<AudioContext | null>(null)
  const knownIds = useRef<Set<string> | null>(null)
  const soundOnRef = useRef(false)

  soundOnRef.current = soundOn

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_STATION)
      if (saved === 'bar' || saved === 'kitchen') setStation(saved)
      const q = new URLSearchParams(window.location.search).get('station')
      if (q === 'bar' || q === 'kitchen') setStation(q)
    } catch { /* storage unavailable */ }
  }, [])

  // ── Sound: two-tone chime via Web Audio (no asset needed). Browsers only
  // allow audio after a user gesture, so it is unlocked by the first tap.
  const unlockAudio = useCallback(() => {
    if (!audioRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext
      if (!Ctx) return
      audioRef.current = new Ctx()
    }
    audioRef.current.resume().then(() => setAudioReady(true)).catch(() => {})
  }, [])

  const playChime = useCallback(() => {
    const ctx = audioRef.current
    if (!ctx || ctx.state !== 'running') return
    const start = ctx.currentTime
    // three "ding-dong" pairs so it is hard to miss in a noisy kitchen
    for (let i = 0; i < 3; i++) {
      for (const [j, freq] of [880, 660].entries()) {
        const t = start + i * 0.9 + j * 0.28
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.0001, t)
        gain.gain.exponentialRampToValueAtTime(0.5, t + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.26)
        osc.connect(gain).connect(ctx.destination)
        osc.start(t)
        osc.stop(t + 0.28)
      }
    }
  }, [])

  useEffect(() => {
    const handler = () => unlockAudio()
    window.addEventListener('pointerdown', handler, { once: true })
    return () => window.removeEventListener('pointerdown', handler)
  }, [unlockAudio])

  const load = useCallback(async () => {
    if (!selectedOutletId) return
    const { data, error } = await supabase.rpc('get_kds_tickets', {
      p_outlet_id: selectedOutletId,
      p_station: station,
      p_include_done: showDone,
    })
    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }
    const list = (data || []) as KdsTicket[]
    const openIds = list.filter(t => t.status === 'new').map(t => t.ticket_id)
    if (knownIds.current) {
      const fresh = openIds.filter(id => !knownIds.current!.has(id))
      if (fresh.length > 0) {
        if (soundOnRef.current) playChime()
        try { navigator.vibrate?.([200, 100, 200]) } catch { /* not supported */ }
        setFlash(true)
        setTimeout(() => setFlash(false), 2500)
      }
    }
    knownIds.current = new Set(openIds)
    setTickets(list)
    setLoading(false)
  }, [supabase, selectedOutletId, station, showDone, playChime])

  // Reset the "already seen" set whenever the screen's scope changes, so
  // switching station/outlet never chimes for tickets that were just waiting.
  useEffect(() => {
    knownIds.current = null
    setLoading(true)
  }, [selectedOutletId, station])

  useEffect(() => {
    load()
    const poll = setInterval(load, POLL_MS)
    return () => clearInterval(poll)
  }, [load])

  // Realtime accelerates delivery; polling above is the safety net.
  useEffect(() => {
    if (!selectedOutletId) return
    const channel = supabase
      .channel(`kds-${selectedOutletId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kds_tickets', filter: `outlet_id=eq.${selectedOutletId}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, selectedOutletId, load])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Keep a wall-mounted tablet awake.
  useEffect(() => {
    let lock: any = null
    ;(navigator as any).wakeLock?.request?.('screen').then((l: any) => { lock = l }).catch(() => {})
    return () => { lock?.release?.().catch?.(() => {}) }
  }, [])

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen().catch(() => toast.error('Layar penuh tidak didukung di browser ini'))
  }

  const chooseStation = (s: Station) => {
    setStation(s)
    try { localStorage.setItem(STORAGE_STATION, s) } catch { /* ignore */ }
  }

  const toggleSound = () => {
    unlockAudio()
    const next = !soundOn
    setSoundOn(next)
    if (next) setTimeout(playChime, 150) // audible confirmation
  }

  const complete = async (id: string) => {
    setTickets(prev => prev.map(t => t.ticket_id === id ? { ...t, status: 'done', done_at: new Date().toISOString() } : t))
    const { error } = await supabase.rpc('complete_kds_ticket', { p_ticket_id: id })
    if (error) toast.error(error.message)
    load()
  }

  const reopen = async (id: string) => {
    const { error } = await supabase.rpc('reopen_kds_ticket', { p_ticket_id: id })
    if (error) toast.error(error.message)
    load()
  }

  const outletName = outlets.find(o => o.id === selectedOutletId)?.name || ''
  const open = tickets.filter(t => t.status === 'new')
  const done = tickets.filter(t => t.status === 'done')
  const StationIcon = station === 'kitchen' ? ChefHat : GlassWater

  return (
    <div className={`flex h-[calc(100dvh-4rem)] flex-col ${flash ? 'ring-4 ring-inset ring-amber-400/70' : ''}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
          {(['kitchen', 'bar'] as Station[]).map(s => (
            <button
              key={s}
              onClick={() => chooseStation(s)}
              className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${station === s ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {s === 'kitchen' ? <ChefHat className="h-4 w-4" /> : <GlassWater className="h-4 w-4" />}
              {s === 'kitchen' ? 'Dapur' : 'Bar'}
            </button>
          ))}
        </div>
        <span className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300">
          {open.length} pesanan aktif
        </span>
        <span className="hidden text-xs text-zinc-500 sm:inline">{outletName}</span>

        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-9 border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800" onClick={() => setShowDone(v => !v)}>
            {showDone ? 'Sembunyikan selesai' : 'Lihat selesai'}
          </Button>
          <Button
            variant="outline"
            size="icon"
            title={soundOn ? 'Matikan suara' : 'Aktifkan suara'}
            aria-label="Suara notifikasi"
            className={`h-9 w-9 border-zinc-800 hover:bg-zinc-800 ${soundOn ? 'bg-emerald-950/40 text-emerald-400' : 'bg-zinc-900 text-zinc-400'}`}
            onClick={toggleSound}
          >
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="icon" title="Layar Penuh" aria-label="Layar Penuh" className="h-9 w-9 border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {!soundOn && (
        <button
          onClick={toggleSound}
          className="mb-2 flex items-center justify-center gap-2 rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-300"
        >
          <BellRing className="h-4 w-4" /> Ketuk untuk mengaktifkan bunyi notifikasi pesanan baru
        </button>
      )}
      {soundOn && !audioReady && (
        <p className="mb-2 text-center text-xs text-amber-400">Ketuk layar sekali untuk mengaktifkan suara di browser ini.</p>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-48 items-center justify-center text-zinc-500"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : open.length === 0 && (!showDone || done.length === 0) ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-zinc-600">
            <StationIcon className="h-12 w-12 opacity-30" />
            <p className="text-sm">Belum ada pesanan untuk {station === 'kitchen' ? 'Dapur' : 'Bar'}.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {[...open, ...(showDone ? done : [])].map(t => {
              const isDone = t.status === 'done'
              const { s, label } = elapsed(t.created_at, now)
              return (
                <div key={t.ticket_id} className={`flex flex-col rounded-xl border-2 p-3 ${isDone ? 'border-zinc-800 bg-zinc-900/40 opacity-60' : ageStyle(s)}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-base font-bold text-zinc-100">#{t.order_no}</span>
                    <span className="text-xs text-zinc-500">{format(new Date(t.created_at), 'HH:mm')}</span>
                    {!isDone && <span className={`font-mono text-lg font-bold ${s >= 600 ? 'text-red-400' : s >= 300 ? 'text-amber-400' : 'text-emerald-400'}`}>{label}</span>}
                  </div>
                  <ul className="flex-1 space-y-1.5">
                    {t.items.map((it, i) => (
                      <li key={i}>
                        <div className="flex items-baseline gap-2 text-zinc-100">
                          <span className="text-xl font-bold tabular-nums">{it.qty}x</span>
                          <span className="text-lg font-medium leading-tight">{it.name}</span>
                        </div>
                        {it.note && (
                          <p className="ml-9 mt-0.5 rounded bg-amber-500/15 px-2 py-0.5 text-sm font-medium text-amber-300">{it.note}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                  {isDone ? (
                    <Button variant="outline" className="mt-3 h-11 border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={() => reopen(t.ticket_id)}>
                      <RotateCcw className="mr-2 h-4 w-4" /> Buka lagi
                    </Button>
                  ) : (
                    <Button className="mt-3 h-12 bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700" onClick={() => complete(t.ticket_id)}>
                      <Check className="mr-2 h-5 w-5" /> Selesai
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
