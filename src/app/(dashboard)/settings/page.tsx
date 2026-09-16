'use client'

import Link from 'next/link'
import {
  Tag,
  Layers,
  BookOpen,
  Landmark,
  CreditCard,
  Building2,
  Users,
  Rocket,
  RotateCcw,
  ArrowRight,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

interface SettingsCard {
  label: string
  description: string
  href: string
  icon: typeof Tag
}

interface SettingsSection {
  name: string
  cards: SettingsCard[]
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    name: 'Katalog & Resep',
    cards: [
      { label: 'Items', description: 'Bahan baku, packaging, dan produk beserta satuannya.', href: '/settings/items', icon: Tag },
      { label: 'BOM / Resep', description: 'Bahan resep untuk item WIP dan produk.', href: '/settings/bom', icon: Layers },
    ],
  },
  {
    name: 'Akuntansi',
    cards: [
      { label: 'Chart of Accounts', description: 'Struktur dan daftar akun akuntansi.', href: '/settings/coa', icon: BookOpen },
      { label: 'Accounting Rules', description: 'Akun default untuk posting otomatis sistem.', href: '/settings/accounting', icon: Landmark },
      { label: 'POS Payment Mapping', description: 'Metode pembayaran POS ke akun akuntansi.', href: '/settings/accounting/pos-mapping', icon: CreditCard },
    ],
  },
  {
    name: 'Organisasi',
    cards: [
      { label: 'Organization Profile', description: 'Identitas dan informasi perusahaan.', href: '/settings/organization', icon: Building2 },
      { label: 'Outlets', description: 'Lokasi/cabang outlet Anda.', href: '/settings/outlets', icon: Building2 },
      { label: 'Users & Roles', description: 'Anggota tim dan hak akses mereka.', href: '/settings/users', icon: Users },
    ],
  },
  {
    name: 'Migrasi & Sistem',
    cards: [
      { label: 'Migrasi Data', description: 'Alur migrasi terpadu — item, resep, produk, dan saldo awal.', href: '/settings/migration', icon: Rocket },
      { label: 'Sistem', description: 'Modul organisasi dan opsi reset data.', href: '/settings/system', icon: RotateCcw },
    ],
  },
]

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      {SETTINGS_SECTIONS.map((section) => (
        <div key={section.name} className="space-y-3">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">{section.name}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.cards.map((card) => (
              <Link key={card.href} href={card.href}>
                <Card className="h-full border-zinc-800 bg-zinc-900/50 backdrop-blur-sm transition-colors hover:bg-zinc-900 hover:border-zinc-700 group">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="h-9 w-9 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                        <card.icon className="h-4 w-4 text-indigo-400" />
                      </div>
                      <ArrowRight className="h-4 w-4 text-zinc-700 transition-colors group-hover:text-zinc-400" />
                    </div>
                    <CardTitle className="text-zinc-100 text-base pt-2">{card.label}</CardTitle>
                    <CardDescription className="text-zinc-400 text-xs leading-relaxed">{card.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
