import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface IncomingLine {
  ingredient_name: string
  qty: number
  unit: string
}

interface IncomingRecipe {
  output_name: string
  output_category: 'wip' | 'finished'
  output_unit: string
  batch_yield_qty: number
  lines: IncomingLine[]
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('org_id, role')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 400 })
    }

    if (!['owner', 'admin', 'finance'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden: Insufficient privileges' }, { status: 403 })
    }

    const body = await request.json()
    const recipes: IncomingRecipe[] = body.recipes

    if (!Array.isArray(recipes) || recipes.length === 0) {
      return NextResponse.json({ error: 'Invalid payload: missing recipes array' }, { status: 400 })
    }

    // Resolve every ingredient name to an item_master id, scoped to this
    // org — ingredients are expected to already exist (raw materials or
    // other WIP), never auto-created, unlike the recipe's own output item.
    const ingredientNames = Array.from(new Set(
      recipes.flatMap(r => (r.lines || []).map(l => l.ingredient_name)).filter(Boolean)
    ))

    const nameToId = new Map<string, string>()
    if (ingredientNames.length > 0) {
      const { data: items } = await supabase
        .from('item_master')
        .select('id, name')
        .eq('org_id', profile.org_id)
        .in('name', ingredientNames)

      for (const item of items || []) {
        nameToId.set(item.name, item.id)
      }
    }

    const notFound = new Set<string>()
    const payload = recipes.map(recipe => ({
      output_name: recipe.output_name,
      output_category: recipe.output_category,
      output_unit: recipe.output_unit,
      batch_yield_qty: recipe.batch_yield_qty,
      lines: (recipe.lines || [])
        .map(line => {
          const input_item_id = nameToId.get(line.ingredient_name)
          if (!input_item_id) {
            notFound.add(line.ingredient_name)
            return null
          }
          return { input_item_id, qty: line.qty, unit: line.unit }
        })
        .filter((l): l is { input_item_id: string; qty: number; unit: string } => l !== null)
    })).filter(recipe => recipe.lines.length > 0)

    if (notFound.size > 0) {
      return NextResponse.json({
        error: `Ingredient(s) not found: ${Array.from(notFound).join(', ')}`,
        not_found: Array.from(notFound)
      }, { status: 400 })
    }

    if (payload.length === 0) {
      return NextResponse.json({ error: 'No valid recipes to import' }, { status: 400 })
    }

    const { data: recipeCount, error: rpcError } = await supabase.rpc('bulk_import_bom', {
      p_org_id: profile.org_id,
      p_recipes: payload
    })

    if (rpcError) throw rpcError

    return NextResponse.json({ success: true, recipe_count: recipeCount })

  } catch (error: any) {
    console.error('Bulk BOM import error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
