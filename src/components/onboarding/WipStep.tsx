'use client'

import { RecipeQuickAdd } from './RecipeQuickAdd'
import type { StepProps } from './types'

export function WipStep({ orgId, accounts, items, onItemCreated, markDone }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Define your WIP (Bahan Setengah Jadi)</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Semi-finished items — sauces, doughs, prepped bases — built from the items you just
          added. Products in the next step can use these as ingredients.
        </p>
      </div>
      <RecipeQuickAdd
        orgId={orgId}
        category="wip"
        emptyLabel="No WIP items yet."
        accounts={accounts}
        items={items}
        onItemCreated={onItemCreated}
        markDone={markDone}
      />
    </div>
  )
}
