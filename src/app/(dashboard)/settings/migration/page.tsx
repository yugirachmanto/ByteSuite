'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tag, Layers, ShoppingBag, ArrowRight, Loader2 } from 'lucide-react'

interface StepCounts {
  rawItems: number
  bomRecipes: number
  products: number
}

export default function MigrationHubPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState<StepCounts>({ rawItems: 0, bomRecipes: 0, products: 0 })

  useEffect(() => {
    async function fetchCounts() {
      setLoading(true)
      const [rawRes, bomRes, productRes] = await Promise.all([
        supabase.from('item_master').select('*', { count: 'exact', head: true }).in('category', ['raw', 'packaging']),
        supabase.from('bom').select('output_item_id'),
        supabase.from('item_master').select('*', { count: 'exact', head: true }).eq('category', 'finished'),
      ])

      const uniqueBomOutputs = new Set((bomRes.data || []).map(r => r.output_item_id)).size

      setCounts({
        rawItems: rawRes.count || 0,
        bomRecipes: uniqueBomOutputs,
        products: productRes.count || 0,
      })
      setLoading(false)
    }
    fetchCounts()
  }, [supabase])

  const steps = [
    {
      step: 1,
      title: 'Bahan Baku & Satuan',
      description: 'Upload semua bahan baku/packaging beserta unit penyimpanan dan unit pembelian sekaligus lewat CSV.',
      icon: Tag,
      count: counts.rawItems,
      countLabel: 'bahan baku terdaftar',
      href: '/settings',
      cta: 'Buka Halaman Items',
    },
    {
      step: 2,
      title: 'Resep / BOM',
      description: 'Definisikan resep untuk item WIP (Bahan Setengah Jadi) maupun Produk — item output yang belum ada akan otomatis dibuat.',
      icon: Layers,
      count: counts.bomRecipes,
      countLabel: 'resep terdaftar',
      href: '/settings/bom/bulk-upload',
      cta: 'Bulk Upload Resep',
    },
    {
      step: 3,
      title: 'Produk',
      description: 'Upload menu/produk jadi lengkap dengan kategori POS dan harga jual per outlet.',
      icon: ShoppingBag,
      count: counts.products,
      countLabel: 'produk terdaftar',
      href: '/products/bulk-upload',
      cta: 'Bulk Upload Produk',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Migrasi Data</h2>
        <p className="text-zinc-400 text-sm mt-0.5">
          Urutan yang disarankan untuk migrasi dari sistem lama — tiap langkah bisa diupload bertahap, tidak wajib berurutan.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((s) => (
          <Card key={s.step} className="border-zinc-800 bg-zinc-900/50 backdrop-blur-sm flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                  <s.icon className="h-4 w-4 text-indigo-400" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Langkah {s.step}</span>
              </div>
              <CardTitle className="text-zinc-100 text-base pt-1">{s.title}</CardTitle>
              <CardDescription className="text-zinc-400 text-xs leading-relaxed">{s.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-between gap-4">
              <div className="text-sm">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-600" />
                ) : (
                  <span className="text-zinc-300">
                    <strong className="text-zinc-100 font-mono">{s.count}</strong> {s.countLabel}
                  </span>
                )}
              </div>
              <Link href={s.href}>
                <Button variant="outline" className="w-full border-zinc-800 text-zinc-300 hover:bg-zinc-800 justify-between">
                  {s.cta}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
