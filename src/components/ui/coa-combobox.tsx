'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, Search, Check } from 'lucide-react'
import { Input } from './input'

interface Coa {
  id: string
  code: string
  name: string
  is_header?: boolean
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
  dropdownClassName
}: CoaComboboxProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Click outside to close
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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
    if (!search) return coas
    const lowerSearch = search.toLowerCase()
    return coas.filter(c => 
      c.code.toLowerCase().includes(lowerSearch) || 
      c.name.toLowerCase().includes(lowerSearch)
    )
  }, [coas, search])

  const selectedCoa = allowAll && value === 'all' 
    ? { id: 'all', code: '', name: 'All Accounts' } 
    : coas.find(c => c.id === value)

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

      {/* Dropdown */}
      {isOpen && (
        <div className={cn(
          "absolute z-50 w-full rounded-md border border-zinc-800 bg-zinc-900 shadow-md outline-none animate-in fade-in-0 zoom-in-95",
          dropdownPosition === 'top' ? "bottom-full mb-1" : "mt-1",
          dropdownClassName
        )}>
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
          <div className="max-h-[300px] overflow-y-auto p-1">
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
                      if (!isDisabled) {
                        onChange(coa.id)
                        setIsOpen(false)
                      }
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
      )}
    </div>
  )
}
