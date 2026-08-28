'use client'

import { useState, useEffect } from 'react'
import { Link2, Search, X, Receipt, Package, Store } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type EntityType = 'invoice' | 'item' | 'outlet'

interface TaskLink {
  id: string
  entity_type: EntityType
  entity_id: string
  label: string
  sublabel: string
}

interface SearchResult {
  id: string
  label: string
  sublabel: string
}

interface TaskLinkPickerProps {
  taskId: string
  outletId: string
  orgId: string
}

const ENTITY_TABS: { id: EntityType; label: string; icon: typeof Receipt }[] = [
  { id: 'invoice', label: 'Invoice', icon: Receipt },
  { id: 'item', label: 'Item', icon: Package },
  { id: 'outlet', label: 'Outlet', icon: Store },
]

export function TaskLinkPicker({ taskId, outletId, orgId }: TaskLinkPickerProps) {
  const supabase = createClient()
  const [links, setLinks] = useState<TaskLink[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [activeType, setActiveType] = useState<EntityType>('invoice')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)

  const fetchLinks = async () => {
    const { data: linkRows } = await supabase
      .from('pm_task_links')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })

    if (!linkRows || linkRows.length === 0) {
      setLinks([])
      return
    }

    const byType = (t: EntityType) => linkRows.filter((r) => r.entity_type === t).map((r) => r.entity_id)
    const invoiceIds = byType('invoice')
    const itemIds = byType('item')
    const outletIds = byType('outlet')

    const [invoicesRes, itemsRes, outletsRes] = await Promise.all([
      invoiceIds.length
        ? supabase.from('invoices').select('id, vendor, invoice_no').in('id', invoiceIds)
        : Promise.resolve({ data: [] as any[] }),
      itemIds.length
        ? supabase.from('item_master').select('id, name, code').in('id', itemIds)
        : Promise.resolve({ data: [] as any[] }),
      outletIds.length
        ? supabase.from('outlets').select('id, name').in('id', outletIds)
        : Promise.resolve({ data: [] as any[] }),
    ])

    const invoiceMap = new Map((invoicesRes.data || []).map((i) => [i.id, i]))
    const itemMap = new Map((itemsRes.data || []).map((i) => [i.id, i]))
    const outletMap = new Map((outletsRes.data || []).map((o) => [o.id, o]))

    setLinks(
      linkRows.map((row) => {
        if (row.entity_type === 'invoice') {
          const inv = invoiceMap.get(row.entity_id)
          return { id: row.id, entity_type: 'invoice', entity_id: row.entity_id, label: inv?.vendor || 'Invoice', sublabel: inv?.invoice_no || row.entity_id.slice(0, 8) }
        }
        if (row.entity_type === 'item') {
          const item = itemMap.get(row.entity_id)
          return { id: row.id, entity_type: 'item', entity_id: row.entity_id, label: item?.name || 'Item', sublabel: item?.code || '' }
        }
        const outlet = outletMap.get(row.entity_id)
        return { id: row.id, entity_type: 'outlet', entity_id: row.entity_id, label: outlet?.name || 'Outlet', sublabel: '' }
      })
    )
  }

  useEffect(() => {
    fetchLinks()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  useEffect(() => {
    if (!pickerOpen) return

    const search = async () => {
      setSearching(true)
      try {
        if (activeType === 'invoice') {
          let q = supabase.from('invoices').select('id, vendor, invoice_no').eq('outlet_id', outletId).limit(10)
          if (query.trim()) q = q.ilike('vendor', `%${query.trim()}%`)
          const { data } = await q
          setResults((data || []).map((i) => ({ id: i.id, label: i.vendor || 'Invoice', sublabel: i.invoice_no || '' })))
        } else if (activeType === 'item') {
          let q = supabase.from('item_master').select('id, name, code').eq('org_id', orgId).limit(10)
          if (query.trim()) q = q.ilike('name', `%${query.trim()}%`)
          const { data } = await q
          setResults((data || []).map((i) => ({ id: i.id, label: i.name, sublabel: i.code || '' })))
        } else {
          let q = supabase.from('outlets').select('id, name').eq('org_id', orgId).limit(10)
          if (query.trim()) q = q.ilike('name', `%${query.trim()}%`)
          const { data } = await q
          setResults((data || []).map((o) => ({ id: o.id, label: o.name, sublabel: '' })))
        }
      } finally {
        setSearching(false)
      }
    }

    const debounce = setTimeout(search, 250)
    return () => clearTimeout(debounce)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerOpen, activeType, query])

  const handleAddLink = async (result: SearchResult) => {
    const { error } = await supabase
      .from('pm_task_links')
      .insert({
        task_id: taskId,
        outlet_id: outletId,
        entity_type: activeType,
        entity_id: result.id,
      })

    if (!error) {
      setQuery('')
      setPickerOpen(false)
      fetchLinks()
    }
  }

  const handleRemoveLink = async (linkId: string) => {
    const { error } = await supabase.from('pm_task_links').delete().eq('id', linkId)
    if (!error) setLinks((prev) => prev.filter((l) => l.id !== linkId))
  }

  const iconFor = (type: EntityType) => ENTITY_TABS.find((t) => t.id === type)?.icon || Link2

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
          <Link2 className="h-4 w-4 text-indigo-400" />
          Item Terkait ({links.length})
        </span>
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
        >
          {pickerOpen ? 'Tutup' : '+ Tautkan'}
        </button>
      </div>

      {links.length === 0 ? (
        <p className="text-xs text-zinc-500 italic py-1">Belum ada invoice, item, atau outlet yang ditautkan.</p>
      ) : (
        <div className="space-y-1.5">
          {links.map((link) => {
            const Icon = iconFor(link.entity_type)
            return (
              <div key={link.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 p-2.5 rounded-lg text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                  <span className="text-zinc-200 truncate">{link.label}</span>
                  {link.sublabel && <span className="text-zinc-500 shrink-0">{link.sublabel}</span>}
                </div>
                <button onClick={() => handleRemoveLink(link.id)} className="text-zinc-500 hover:text-rose-400 shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {pickerOpen && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 space-y-2.5">
          <div className="flex gap-1.5">
            {ENTITY_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveType(tab.id); setQuery('') }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                  activeType === tab.id ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30' : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                }`}
              >
                <tab.icon className="h-3 w-3" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <input
              autoFocus
              type="text"
              placeholder={`Cari ${activeType}...`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="max-h-40 overflow-y-auto space-y-1">
            {searching ? (
              <div className="text-center text-[11px] text-zinc-500 py-3">Mencari...</div>
            ) : results.length === 0 ? (
              <div className="text-center text-[11px] text-zinc-500 py-3">Tidak ada hasil.</div>
            ) : (
              results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => handleAddLink(r)}
                  className="w-full flex items-center justify-between text-left px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-xs"
                >
                  <span className="text-zinc-200 truncate">{r.label}</span>
                  {r.sublabel && <span className="text-zinc-500 text-[11px] shrink-0 ml-2">{r.sublabel}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
