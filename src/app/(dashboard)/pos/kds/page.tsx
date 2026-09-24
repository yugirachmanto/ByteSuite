'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'
import { Loader2, Volume2, VolumeX, Maximize, Minimize, Check, RotateCcw, BellRing, ChefHat } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface KdsItem { name: string; qty: number; note: string | null }
interface KdsOrder {
  order_id: string
  order_no: string
  status: 'new' | 'done'
  created_at: string
  done_at: string | null
  items: KdsItem[]
}

const POLL_MS = 8000
// Mirrors the server: an unfinished order leaves the screen after this long,
// so an ignored ticket can never sit there with an ever-growing timer.
const EXPIRE_SECONDS = 45 * 60
const RING_MAX_MS = 8000
const SOUND_SRC = '/sounds/new-order.mp3'

function elapsed(fromIso: string, nowMs: number) {
  const s = Math.min(EXPIRE_SECONDS, Math.max(0, Math.floor((nowMs - new Date(fromIso).getTime()) / 1000)))
  return { s, label: `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
}

// Green -> amber -> red as an order waits longer.
function ageStyle(seconds: number) {
  if (seconds >= 600) return 'border-red-500/70 bg-red-950/30'
  if (seconds >= 300) return 'border-amber-500/70 bg-amber-950/20'
  return 'border-emerald-600/60 bg-zinc-900'
}

export default function KitchenDisplayPage() {
  const supabase = createClient()
  const { selectedOutletId, outlets, kdsEnabled, loading: outletLoading } = useOutlet()
  const [orders, setOrders] = useState<KdsOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [showDone, setShowDone] = useState(false)
  const [soundOn, setSoundOn] = useState(false)
  const [flash, setFlash] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const ringTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const knownIds = useRef<Set<string> | null>(null)
  const soundOnRef = useRef(false)
  soundOnRef.current = soundOn

  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      const a = new Audio(SOUND_SRC)
      a.preload = 'auto'
      audioRef.current = a
    }
    return audioRef.current
  }, [])

  // Browsers only allow sound after a tap; playing it once (muted) inside the
  // tap unlocks later programmatic playback, including on iOS.
  const unlockAudio = useCallback(() => {
    const a = getAudio()
    a.muted = true
    a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false }).catch(() => { a.muted = false })
  }, [getAudio])

  const ring = useCallback(() => {
    const a = getAudio()
    if (ringTimer.current) clearTimeout(ringTimer.current)
    a.pause()
    a.currentTime = 0
    a.muted = false
    a.play().catch(() => {})
    // The recording is long; stop it after a few seconds.
    ringTimer.current = setTimeout(() => a.pause(), RING_MAX_MS)
  }, [getAudio])

  const load = useCallback(async () => {
    if (!selectedOutletId || !kdsEnabled) { setLoading(false); return }
    const { data, error } = await supabase.rpc('get_kds_orders', {
      p_outlet_id: selectedOutletId,
      p_include_done: showDone,
    })
    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }
    const list = (data || []) as KdsOrder[]
    const openIds = list.filter(o => o.status === 'new').map(o => o.order_id)
    if (knownIds.current) {
      const fresh = openIds.filter(id => !knownIds.current!.has(id))
      if (fresh.length > 0) {
        if (soundOnRef.current) ring()
        try { navigator.vibrate?.([200, 100, 200]) } catch { /* not supported */ }
        setFlash(true)
        setTimeout(() => setFlash(false), 2500)
      }
    }
    knownIds.current = new Set(openIds)
    setOrders(list)
    setLoading(false)
  }, [supabase, selectedOutletId, kdsEnabled, showDone, ring])

  // Switching outlet must not chime for orders that were simply already waiting.
  useEffect(() => {
    knownIds.current = null
    setLoading(true)
  }, [selectedOutletId])

  useEffect(() => {
    load()
    const poll = setInterval(load, POLL_MS)
    return () => clearInterval(poll)
  }, [load])

  // Realtime speeds delivery up; polling above is the safety net.
  useEffect(() => {
    if (!selectedOutletId || !kdsEnabled) return
    const channel = supabase
      .channel(`kds-${selectedOutletId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kds_tickets', filter: `outlet_id=eq.${selectedOutletId}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, selectedOutletId, kdsEnabled, load])

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

  useEffect(() => () => { if (ringTimer.current) clearTimeout(ringTimer.current) }, [])

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen().catch(() => toast.error('Layar penuh tidak didukung di browser ini'))
  }

  const toggleSound = () => {
    const next = !soundOn
    if (next) {
      unlockAudio()
      setTimeout(ring, 250) // audible confirmation
    } else {
      audioRef.current?.pause()
    }
    setSoundOn(next)
  }

  const complete = async (id: string) => {
    setOrders(prev => prev.map(o => o.order_id === id ? { ...o, status: 'done', done_at: new Date().toISOString() } : o))
    const { error } = await supabase.rpc('complete_kds_order', { p_order_id: id })
    if (error) toast.error(error.message)
    load()
  }

  const reopen = async (id: string) => {
    const { error } = await supabase.rpc('reopen_kds_order', { p_order_id: id })
    if (error) toast.error(error.message)
    load()
  }

  const outletName = outlets.find(o => o.id === selectedOutletId)?.name || ''

  if (!outletLoading && !kdsEnabled) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 p-8 text-center">
        <ChefHat className="mx-auto mb-3 h-10 w-10 text-zinc-600" />
        <h2 className="text-lg font-semibold text-zinc-200">Layar Dapur &amp; Bar belum diaktifkan</h2>
        <p className="mt-1 text-sm text-zinc-500">Fitur ini opsional. Aktifkan di Settings &rarr; System &rarr; Organization Modules bila ingin menampilkan pesanan baru di layar dapur/bar.</p>
        <Link href="/settings/system" className="mt-4 inline-block text-sm text-indigo-400 hover:underline">Buka pengaturan</Link>
      </div>
    )
  }

  // Also hide, locally, anything past the expiry between polls.
  const visible = orders.filter(o => o.status === 'done' || (now - new Date(o.created_at).getTime()) / 1000 < EXPIRE_SECONDS)
  const open = visible.filter(o => o.status === 'new')
  const done = visible.filter(o => o.status === 'done')

  return (
    <div className={`flex h-[calc(100dvh-4rem)] flex-col ${flash ? 'ring-4 ring-inset ring-amber-400/70' : ''}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-zinc-200">
          <ChefHat className="h-4 w-4 text-indigo-400" /> {open.length} pesanan aktif
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

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-48 items-center justify-center text-zinc-500"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : open.length === 0 && (!showDone || done.length === 0) ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-zinc-600">
            <ChefHat className="h-12 w-12 opacity-30" />
            <p className="text-sm">Belum ada pesanan.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {[...open, ...(showDone ? done : [])].map(o => {
              const isDone = o.status === 'done'
              const { s, label } = elapsed(o.created_at, now)
              return (
                <div key={o.order_id} className={`flex flex-col rounded-xl border-2 p-3 ${isDone ? 'border-zinc-800 bg-zinc-900/40 opacity-60' : ageStyle(s)}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-base font-bold text-zinc-100">#{o.order_no}</span>
                    <span className="text-xs text-zinc-500">{format(new Date(o.created_at), 'HH:mm')}</span>
                    {!isDone && <span className={`font-mono text-lg font-bold ${s >= 600 ? 'text-red-400' : s >= 300 ? 'text-amber-400' : 'text-emerald-400'}`}>{label}</span>}
                  </div>
                  <ul className="flex-1 space-y-1.5">
                    {o.items.map((it, i) => (
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
                    <Button variant="outline" className="mt-3 h-11 border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={() => reopen(o.order_id)}>
                      <RotateCcw className="mr-2 h-4 w-4" /> Buka lagi
                    </Button>
                  ) : (
                    <Button className="mt-3 h-12 bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700" onClick={() => complete(o.order_id)}>
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
