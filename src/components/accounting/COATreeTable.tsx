'use client'

/**
 * COATreeTable.tsx
 * 
 * An interactive, collapsible tree table for Chart of Accounts (COA) with
 * rolled-up debit/credit/balance figures. Uses DB-native parent_id, level,
 * and is_header fields from the hierarchy migration.
 * 
 * - Level 1 (class headers): boldest, colored left-border
 * - Level 2 (group headers): semi-bold, indented
 * - Level 3 (sub-group headers): medium weight, indented
 * - Level 4+ (leaves): lightest, full indent
 * 
 * Props:
 *   data        - flat array of COA rows from get_coa_balance_tree() or glSummary
 *   showBalances - if false, hide Debit/Credit/Balance columns (useful in COA listing)
 *   emptyMessage - shown when data is empty
 */

import { useState, useMemo, useCallback } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRp } from '@/lib/format'

// ── Types ───────────────────────────────────────────────────────────────────
export interface CoaTreeRow {
  id:          string
  code:        string
  name:        string
  type:        string
  level:       number
  is_header:   boolean
  parent_id:   string | null
  totalDebit:  number
  totalCredit: number
  balance?:    number
  // Runtime fields added during tree construction
  children?:   CoaTreeRow[]
  depth?:      number
}

interface COATreeTableProps {
  data:          CoaTreeRow[]
  showBalances?: boolean
  emptyMessage?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function buildTree(flat: CoaTreeRow[]): CoaTreeRow[] {
  const byId: Record<string, CoaTreeRow & { children: CoaTreeRow[] }> = {}
  flat.forEach(row => {
    byId[row.id] = { ...row, children: [] }
  })

  const roots: (CoaTreeRow & { children: CoaTreeRow[] })[] = []
  flat.forEach(row => {
    if (row.parent_id && byId[row.parent_id]) {
      byId[row.parent_id].children.push(byId[row.id])
    } else {
      roots.push(byId[row.id])
    }
  })

  // Dynamic self-healing: if an account has children, it IS a header!
  Object.values(byId).forEach(node => {
    if (node.children && node.children.length > 0) {
      node.is_header = true
    }
  })

  return roots.sort((a, b) => a.code.localeCompare(b.code))
}

function flattenTree(nodes: CoaTreeRow[], depth = 0, result: CoaTreeRow[] = []): CoaTreeRow[] {
  const sorted = [...nodes].sort((a, b) => a.code.localeCompare(b.code))
  sorted.forEach(node => {
    result.push({ ...node, depth })
    if ((node as any).children?.length > 0) {
      flattenTree((node as any).children, depth + 1, result)
    }
  })
  return result
}

// ── Style helpers ────────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  income:    'border-l-indigo-500 bg-indigo-950/40',
  asset:     'border-l-blue-500 bg-blue-950/40',
  liability: 'border-l-red-500 bg-red-950/40',
  equity:    'border-l-zinc-400 bg-zinc-800/50',
  expense:   'border-l-amber-500 bg-amber-950/40',
}

const TYPE_BADGE: Record<string, string> = {
  income:    'bg-indigo-500/10 text-indigo-400',
  asset:     'bg-blue-500/10 text-blue-400',
  liability: 'bg-red-500/10 text-red-400',
  equity:    'bg-zinc-500/10 text-zinc-400',
  expense:   'bg-amber-500/10 text-amber-400',
}

type FadeConfig = {
  nameCls: string
  codeCls: string
  numCls:  string
  py:      string
}

function getDepthFade(depth: number): FadeConfig {
  const configs: FadeConfig[] = [
    // depth 0 — class header (level 1): bold, bright
    { nameCls: 'font-bold text-zinc-100 text-xs',         codeCls: 'font-bold text-xs',          numCls: 'text-zinc-100', py: 'py-3.5' },
    // depth 1 — group header (level 2): semi-bold
    { nameCls: 'font-semibold text-zinc-300 text-xs',     codeCls: 'font-medium text-[11px]',     numCls: 'text-zinc-300', py: 'py-2.5' },
    // depth 2 — sub-group header (level 3): medium
    { nameCls: 'font-medium text-zinc-400 text-xs',       codeCls: 'font-normal text-[10px]',     numCls: 'text-zinc-400', py: 'py-2' },
    // depth 3 — leaf (level 4): lighter
    { nameCls: 'font-normal text-zinc-500 text-[11px]',   codeCls: 'font-normal text-[10px]',     numCls: 'text-zinc-500', py: 'py-1.5' },
    // depth 4+ — deep leaf: faintest
    { nameCls: 'font-normal text-zinc-600 text-[10px]',   codeCls: 'font-normal text-[10px]',     numCls: 'text-zinc-600', py: 'py-1.5' },
  ]
  return configs[Math.min(depth, configs.length - 1)]
}

function renderTreeGuides(depth: number) {
  if (depth === 0) return null
  return (
    <span className="inline-flex items-center select-none font-mono text-zinc-700/80 mr-1.5">
      {Array.from({ length: depth - 1 }).map((_, i) => (
        <span key={i} className="inline-block w-3.5 border-r border-zinc-800/60 h-3 mr-1" />
      ))}
      <span className="text-zinc-600">└─</span>
    </span>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────
export function COATreeTable({
  data,
  showBalances = true,
  emptyMessage = 'Tidak ada akun pada periode ini.',
}: COATreeTableProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const tree = useMemo(() => buildTree(data), [data])

  // Collect all header IDs for expand/collapse all
  const allHeaderIds = useMemo(
    () => data.filter(r => r.is_header).map(r => r.id),
    [data]
  )

  const expandAll  = useCallback(() => setCollapsed(new Set()), [])
  const collapseAll = useCallback(() => setCollapsed(new Set(allHeaderIds)), [allHeaderIds])

  const toggleNode = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Build a flat visible list, respecting collapsed state
  const visibleRows = useMemo(() => {
    const result: (CoaTreeRow & { depth: number })[] = []

    function walk(nodes: CoaTreeRow[], depth: number) {
      const sorted = [...nodes].sort((a, b) => a.code.localeCompare(b.code))
      sorted.forEach(node => {
        result.push({ ...node, depth })
        if ((node as any).children?.length > 0 && !collapsed.has(node.id)) {
          walk((node as any).children, depth + 1)
        }
      })
    }

    walk(tree, 0)
    return result
  }, [tree, collapsed])

  if (data.length === 0) {
    return (
      <div className="py-16 text-center text-zinc-600 text-sm italic">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      {/* Controls */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800/60">
        <button
          onClick={expandAll}
          className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded hover:bg-zinc-800/60 transition-colors"
        >
          Expand All
        </button>
        <span className="text-zinc-700">|</span>
        <button
          onClick={collapseAll}
          className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded hover:bg-zinc-800/60 transition-colors"
        >
          Collapse All
        </button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800/60 bg-zinc-900/20">
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-500 w-36">Kode</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-500">Nama Akun</th>
            <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-500 w-24">Tipe</th>
            {showBalances && (
              <>
                <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-zinc-500 w-32">Total Debit</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-zinc-500 w-32">Total Kredit</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-zinc-500 w-32">Saldo</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => {
            const isL1Header  = row.is_header && row.depth === 0
            const isSubHeader = row.is_header && row.depth > 0
            const hasChildren = (row as any).children?.length > 0
            const isOpen      = !collapsed.has(row.id)
            const fade        = getDepthFade(row.depth)
            const balance     = row.balance ?? (row.totalDebit - row.totalCredit)

            // Row background: class headers get type-colored bg, sub-headers get subtle bg
            const rowBg = isL1Header
              ? cn('border-l-2', TYPE_COLORS[row.type] || TYPE_COLORS.expense)
              : isSubHeader && row.depth === 1
              ? 'bg-zinc-800/15'
              : ''

            return (
              <tr
                key={row.id}
                className={cn(
                  'border-b transition-all duration-100',
                  isL1Header ? 'border-zinc-700/60' : 'border-zinc-800/20',
                  rowBg,
                  row.is_header ? 'hover:brightness-110' : 'hover:bg-zinc-800/20',
                )}
              >
                {/* Code */}
                <td className={cn('px-4 font-mono whitespace-nowrap', fade.py)}>
                  <span className={cn(
                    fade.codeCls,
                    isL1Header ? 'text-indigo-400' : 'text-zinc-600',
                  )}>
                    {row.code}
                  </span>
                </td>

                {/* Name with tree guides + expand chevron */}
                <td className={cn('px-4', fade.py)}>
                  <span className="flex items-center gap-1">
                    {renderTreeGuides(row.depth)}

                    {/* Expand/collapse chevron for header nodes */}
                    {row.is_header && hasChildren ? (
                      <button
                        onClick={() => toggleNode(row.id)}
                        className={cn(
                          'inline-flex items-center justify-center w-4 h-4 rounded transition-colors flex-shrink-0',
                          'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/40',
                        )}
                        aria-label={isOpen ? 'Collapse' : 'Expand'}
                      >
                        {isOpen
                          ? <ChevronDown className="w-3 h-3" />
                          : <ChevronRight className="w-3 h-3" />
                        }
                      </button>
                    ) : (
                      <span className="w-4 h-4 flex-shrink-0" aria-hidden />
                    )}

                    <span className={fade.nameCls}>{row.name}</span>
                  </span>
                </td>

                {/* Type badge — only on L1 headers */}
                <td className={cn('px-4', fade.py)}>
                  {isL1Header ? (
                    <span className={cn(
                      'text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full',
                      TYPE_BADGE[row.type] || TYPE_BADGE.expense,
                    )}>
                      {row.type}
                    </span>
                  ) : (
                    <span className="text-[9px] text-zinc-700">—</span>
                  )}
                </td>

                {/* Balances */}
                {showBalances && (
                  <>
                    <td className={cn('px-4 text-right font-mono text-xs', fade.py, fade.numCls)}>
                      {row.totalDebit > 0
                        ? formatRp(row.totalDebit)
                        : <span className="text-zinc-700">—</span>
                      }
                    </td>
                    <td className={cn('px-4 text-right font-mono text-xs', fade.py, fade.numCls)}>
                      {row.totalCredit > 0
                        ? formatRp(row.totalCredit)
                        : <span className="text-zinc-700">—</span>
                      }
                    </td>
                    <td className={cn(
                      'px-4 text-right font-mono text-xs',
                      fade.py,
                      isL1Header
                        ? balance < 0 ? 'font-bold text-red-400' : 'font-bold text-zinc-100'
                        : isSubHeader
                        ? balance < 0 ? 'text-red-400/70' : fade.numCls
                        : balance < 0 ? 'text-red-400/50' : fade.numCls,
                    )}>
                      {formatRp(balance)}
                    </td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
