'use client'

import Link from 'next/link'
import { FileEdit, ShoppingCart, PackageCheck, FileText, Check, Minus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StageInfo, StageStatus } from '@/lib/procurement/stage'

const STAGE_ICONS = {
  pr: FileEdit,
  po: ShoppingCart,
  gr: PackageCheck,
  invoice: FileText,
} as const

const NODE_CLASSES: Record<StageStatus, string> = {
  done: 'bg-emerald-950/40 border-emerald-700 text-emerald-400',
  current: 'bg-indigo-950/40 border-indigo-600 text-indigo-400',
  pending: 'bg-zinc-900 border-zinc-800 text-zinc-600',
  blocked: 'bg-red-950/40 border-red-800 text-red-400',
  skipped: 'bg-zinc-900 border-zinc-800 border-dashed text-zinc-700',
}

const LINE_CLASSES: Record<StageStatus, string> = {
  done: 'bg-emerald-700',
  current: 'bg-zinc-800',
  pending: 'bg-zinc-800',
  blocked: 'bg-zinc-800',
  skipped: 'bg-zinc-800',
}

interface StageStripProps {
  stages: StageInfo[]
  size?: 'default' | 'compact'
}

export function StageStrip({ stages, size = 'default' }: StageStripProps) {
  if (size === 'compact') {
    return (
      <div className="flex items-center">
        {stages.map((stage, idx) => {
          const isLast = idx === stages.length - 1
          const content = (
            <div className="flex items-center gap-1.5 shrink-0">
              <StatusDot status={stage.status} />
              <span className={cn('text-[11px] font-medium whitespace-nowrap', stage.status === 'pending' || stage.status === 'skipped' ? 'text-zinc-600' : 'text-zinc-300')}>
                {stage.label}
              </span>
            </div>
          )
          return (
            <div key={stage.key} className="flex items-center">
              {stage.href ? (
                <Link href={stage.href} className="hover:opacity-80 transition-opacity" title={stage.sublabel}>
                  {content}
                </Link>
              ) : (
                <div title={stage.sublabel}>{content}</div>
              )}
              {!isLast && <div className={cn('h-[1.5px] w-5 mx-1.5 shrink-0', LINE_CLASSES[stage.status])} />}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex items-start">
      {stages.map((stage, idx) => {
        const Icon = STAGE_ICONS[stage.key]
        const isLast = idx === stages.length - 1
        const node = (
          <div className="flex flex-col items-center gap-2 w-24 text-center">
            <div className={cn('flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors', NODE_CLASSES[stage.status])}>
              {stage.status === 'done' ? <Check className="h-4 w-4" /> : stage.status === 'blocked' ? <X className="h-4 w-4" /> : stage.status === 'skipped' ? <Minus className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
            </div>
            <div>
              <p className={cn('text-xs font-semibold', stage.status === 'pending' || stage.status === 'skipped' ? 'text-zinc-600' : 'text-zinc-200')}>{stage.label}</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">{stage.sublabel}</p>
            </div>
          </div>
        )
        return (
          <div key={stage.key} className="flex items-start flex-1 last:flex-none">
            {stage.href ? (
              <Link href={stage.href} className="hover:opacity-80 transition-opacity">
                {node}
              </Link>
            ) : node}
            {!isLast && <div className={cn('h-[2px] flex-1 mt-5 rounded-full', LINE_CLASSES[stage.status])} />}
          </div>
        )
      })}
    </div>
  )
}

function StatusDot({ status }: { status: StageStatus }) {
  return (
    <div
      className={cn(
        'h-2.5 w-2.5 rounded-full border shrink-0',
        status === 'done' && 'bg-emerald-500 border-emerald-500',
        status === 'current' && 'bg-indigo-500 border-indigo-500',
        status === 'pending' && 'bg-transparent border-zinc-700',
        status === 'blocked' && 'bg-red-500 border-red-500',
        status === 'skipped' && 'bg-transparent border-zinc-800 border-dashed'
      )}
    />
  )
}
