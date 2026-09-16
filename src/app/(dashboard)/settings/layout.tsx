'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SectionMeta {
  prefix: string
  label: string
  description: string
  /** Page already renders its own header/back-link (e.g. one level deeper than a settings section) — layout adds nothing. */
  ownHeader?: boolean
}

// Drives the back-link + title shown above every settings subpage. Sorted
// by prefix length (longest first) at lookup time so a nested route like
// /settings/accounting/pos-mapping resolves before its parent /settings/accounting.
const SECTION_META: SectionMeta[] = [
  { prefix: '/settings/items', label: 'Items', description: 'Bahan baku, packaging, dan produk beserta satuannya.' },
  { prefix: '/settings/bom/bulk-upload', label: '', description: '', ownHeader: true },
  { prefix: '/settings/bom', label: 'BOM / Resep', description: 'Definisikan bahan resep untuk item WIP dan produk Anda.' },
  { prefix: '/settings/accounting/pos-mapping', label: 'POS Payment Mapping', description: 'Petakan metode pembayaran POS ke akun akuntansi.' },
  { prefix: '/settings/accounting', label: 'Accounting Rules', description: 'Akun default yang dipakai sistem untuk posting otomatis.' },
  { prefix: '/settings/coa', label: 'Chart of Accounts', description: 'Struktur dan daftar akun akuntansi Anda.' },
  { prefix: '/settings/organization', label: 'Organization Profile', description: 'Identitas dan informasi perusahaan.' },
  { prefix: '/settings/outlets', label: 'Outlets', description: 'Kelola lokasi/cabang outlet Anda.' },
  { prefix: '/settings/users', label: 'Users & Roles', description: 'Anggota tim dan hak akses mereka.' },
  { prefix: '/settings/migration', label: 'Migrasi Data', description: 'Urutan yang disarankan untuk migrasi dari sistem lama — tiap langkah bisa diupload bertahap, tidak wajib berurutan.' },
  { prefix: '/settings/import', label: 'Saldo Awal Inventori', description: 'Import saldo awal stok bahan baku dan WIP.' },
  { prefix: '/settings/system', label: 'Sistem', description: 'Modul organisasi dan opsi reset data.' },
]

function getSectionMeta(pathname: string): SectionMeta | null {
  const matches = SECTION_META
    .filter(s => pathname === s.prefix || pathname.startsWith(s.prefix + '/'))
    .sort((a, b) => b.prefix.length - a.prefix.length)
  return matches[0] || null
}

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isRoot = pathname === '/settings'
  const section = !isRoot && pathname ? getSectionMeta(pathname) : null

  return (
    <div className="space-y-6">
      {isRoot && (
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Settings</h2>
          <p className="text-zinc-400 text-sm">Kelola item, resep, akun, tim, dan migrasi data Anda.</p>
        </div>
      )}

      {section && !section.ownHeader && (
        <div className="flex items-center gap-4">
          <Link href="/settings">
            <Button variant="ghost" size="icon" className="text-zinc-400">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-100">{section.label}</h2>
            <p className="text-zinc-400 text-sm">{section.description}</p>
          </div>
        </div>
      )}

      {children}
    </div>
  )
}
