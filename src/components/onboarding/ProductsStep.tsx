'use client'

import { RecipeQuickAdd } from './RecipeQuickAdd'
import type { StepProps } from './types'

export function ProductsStep({ orgId, accounts, items, onItemCreated, markDone }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">Define your Products / Menu</h2>
        <p className="text-sm text-zinc-400 mt-1">
          What you sell to customers. Build each product&apos;s recipe from the items and WIP you
          just created — this is what drives food cost and stock deduction at checkout.
        </p>
      </div>
      <RecipeQuickAdd
        orgId={orgId}
        category="finished"
        emptyLabel="No products yet."
        accounts={accounts}
        items={items}
        onItemCreated={onItemCreated}
        markDone={markDone}
      />
    </div>
  )
}
