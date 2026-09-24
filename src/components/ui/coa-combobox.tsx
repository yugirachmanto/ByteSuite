'use client'

import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { ChevronDown, Search, Check } from 'lucide-react'
import { Input } from './input'
import { toast } from 'sonner'

export type CoaType = 'asset' | 'liability' | 'equity' | 'income' | 'expense'

interface Coa {
  id: string
  code: string
  name: string
  is_header?: boolean
  type?: CoaType | string
}

interface CoaComboboxProps {
  coas: Coa[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  allowAll?: boolean // For ledger filter
  dropdownPosition?: 'top' | 'bottom'
  dropdownClassName?: string
  /**
   * Restrict selectable accounts to one or more account types (e.g. only
   * 'income' for a revenue mapping, only 'expense' for a COGS mapping).
   * A header account is still shown (for context/grouping) as long as it
   * has at least one matching descendant — filtering purely by the
   * header's own `type` would hide the group entirely in many COA trees
   * where a header's type doesn't exactly match its children's.
   * Omit to show every type (e.g. a general journal entry).
   */
  typeFilter?: CoaType | CoaType[]
}

export function CoaCombobox({
  coas,
  value,
  onChange,
  placeholder = "Select Account...",
  className,
  disabled = false,
  allowAll = false,
  dropdownPosition = 'bottom',
  dropdownClassName,
  typeFilter
}: CoaComboboxProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [mounted, setMounted] = useState(false)
  // The dropdown is portaled to <body> (see below) so it can never be
  // clipped by an ancestor's `overflow-x-auto` — e.g. a settings table
  // wrapping this combobox in a scrollable container, which used to cut
  // the popover off before a user could see the full account list.
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({})
  const [listMaxHeight, setListMaxHeight] = useState(300)
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => setMounted(true), [])

  const typeFilterList = typeFilter ? (Array.isArray(typeFilter) ? typeFilter : [typeFilter]) : null

  // Apply the type filter before anything else. Every seeded account (header
  // or leaf) carries the `type` of its top-level category — a header and its
  // descendants always share the same type in this schema — so filtering by
  // `type` alone naturally keeps a matching header alongside its matching
  // children, with no separate hierarchy walk needed.
  const scopedCoas = useMemo(() => {
    if (!typeFilterList) return coas
    return coas.filter((c) => c.type && typeFilterList.includes(c.type as CoaType))
  }, [coas, typeFilterList])

  const updatePosition = () => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const gap = 4
    const margin = 12
    const chrome = 52 // search box + borders above the scrolling list

    // Open upward when there is not enough room below (e.g. the last rows of
    // a table near the bottom of the screen), and cap the list height to the
    // room actually available so it is never cut off by the viewport.
    const below = vh - rect.bottom - margin
    const above = rect.top - margin
    const openUp = dropdownPosition === 'top' || (below < 240 && above > below)
    setListMaxHeight(Math.max(120, Math.min(300, (openUp ? above : below) - chrome)))

    const style: React.CSSProperties = { position: 'fixed', zIndex: 50 }
    // A caller-supplied dropdownClassName may set its own width (e.g.
    // "w-max min-w-[350px]") — only impose our own floor width when it
    // doesn't, so that override still fully controls sizing.
    let left = rect.left
    if (!dropdownClassName) {
      const width = Math.min(Math.max(rect.width, 320), vw - 16)
      style.width = width
      left = Math.min(Math.max(8, rect.left), vw - width - 8)
    }
    style.left = left
    if (openUp) {
      style.bottom = vh - rect.top + gap
    } else {
      style.top = rect.bottom + gap
    }
    setDropdownStyle(style)
  }

  useLayoutEffect(() => {
    if (!isOpen) return
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Click outside to close — the dropdown now lives in a portal outside
  // containerRef, so a click inside it must also be recognized as "inside".
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    } else {
      setSearch('') // Reset search when closed
    }
  }, [isOpen])

  const filteredCoas = useMemo(() => {
    if (!search) return scopedCoas
    const lowerSearch = search.toLowerCase()
    return scopedCoas.filter(c =>
      c.code.toLowerCase().includes(lowerSearch) ||
      c.name.toLowerCase().includes(lowerSearch)
    )
  }, [scopedCoas, search])

  const selectedCoa = allowAll && value === 'all'
    ? { id: 'all', code: '', name: 'All Accounts' }
    : coas.find(c => c.id === value)

  const dropdown = isOpen && (
    <div
      ref={dropdownRef}
      style={dropdownStyle}
      className={cn(
        "rounded-md border border-zinc-800 bg-zinc-900 shadow-md outline-none animate-in fade-in-0 zoom-in-95",
        dropdownClassName
      )}
    >
      <div className="flex items-center border-b border-zinc-800 px-3">
        <Search className="mr-2 h-4 w-4 shrink-0 text-zinc-500" />
        <input
          ref={inputRef}
          className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-zinc-500 text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Search account..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="overflow-y-auto p-1" style={{ maxHeight: listMaxHeight }}>
        {allowAll && !search && (
           <div
             className={cn(
               "relative flex w-full cursor-default items-center rounded-sm py-2 px-2 text-sm outline-none transition-colors",
               value === 'all' ? "bg-zinc-800 text-zinc-100" : "hover:bg-zinc-800/50 text-zinc-300"
             )}
             onClick={() => {
               onChange('all')
               setIsOpen(false)
             }}
           >
             <span className="flex-1">All Accounts</span>
             {value === 'all' && <Check className="ml-auto h-4 w-4 text-zinc-100" />}
           </div>
        )}

        {filteredCoas.length === 0 ? (
          <div className="py-6 text-center text-sm text-zinc-500">
            No accounts found.
          </div>
        ) : (
          filteredCoas.map((coa) => {
            const isSelected = value === coa.id
            const isDisabled = coa.is_header

            return (
              <div
                key={coa.id}
                className={cn(
                  "relative flex w-full cursor-default items-center rounded-sm py-2 px-2 text-sm outline-none transition-colors",
                  isDisabled
                    ? "text-zinc-500 italic opacity-80"
                    : isSelected
                      ? "bg-zinc-800 text-zinc-100"
                      : "hover:bg-zinc-800/50 text-zinc-300 hover:text-zinc-100",
                  !isDisabled && "cursor-pointer"
                )}
                onClick={() => {
                  if (isDisabled) {
                    // Previously a silent no-op — clicking a header account did
                    // nothing at all (dropdown stayed open, no selection made),
                    // which reads as "I picked it" while nothing was actually saved.
                    toast.error(`"${coa.name}" is a header account and can't be selected directly — choose one of its sub-accounts.`)
                    return
                  }
                  onChange(coa.id)
                  setIsOpen(false)
                }}
              >
                <span className="flex-1 whitespace-normal break-words">
                  {isDisabled ? `▸ ${coa.code} — ${coa.name}` : `   ${coa.code} — ${coa.name}`}
                </span>
                {isSelected && <Check className="ml-2 h-4 w-4 shrink-0 text-zinc-100" />}
              </div>
            )
          })
        )}
      </div>
    </div>
  )

  return (
    <div className={cn("relative w-full", className)} ref={containerRef}>
      {/* Trigger */}
      <div
        className={cn(
          "flex min-h-[2.5rem] h-auto w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-zinc-900 py-2 pr-2 pl-3 text-sm transition-colors cursor-pointer",
          disabled && "cursor-not-allowed opacity-50",
          isOpen && "ring-2 ring-ring/50 border-ring"
        )}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span className="flex-1 whitespace-normal break-words text-left">
          {selectedCoa ? (
            allowAll && value === 'all' ? 'All Accounts' : `${selectedCoa.code} - ${selectedCoa.name}`
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
      </div>

      {mounted && dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  )
}
