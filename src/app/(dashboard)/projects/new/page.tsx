'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, FolderPlus, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export default function NewProjectPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const [formData, setFormData] = useState({
    project_code: `PRJ-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    name: '',
    description: '',
    status: 'active',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      setErrorMsg('Nama project wajib diisi.')
      return
    }

    setLoading(true)
    setErrorMsg('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setErrorMsg('User tidak terautentikasi.')
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) {
      setErrorMsg('Organisasi/Tenant tidak ditemukan.')
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('pm_projects')
      .insert({
        org_id: profile.org_id,
        project_code: formData.project_code,
        name: formData.name,
        description: formData.description || null,
        status: formData.status,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        owner_id: user.id
      })
      .select('id')
      .single()

    if (error) {
      console.error('Create project error:', error.message)
      setErrorMsg(error.message)
      setLoading(false)
    } else {
      router.push(`/projects/${data.id}`)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/projects" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Daftar Projects
      </Link>

      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <FolderPlus className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Buat Project Baru</h1>
            <p className="text-xs text-zinc-400">Isi detail project untuk mulai mengelola task dan tim.</p>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-xs text-rose-400">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Kode Project</label>
              <input 
                type="text"
                value={formData.project_code}
                onChange={(e) => setFormData({ ...formData, project_code: e.target.value })}
                required
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Status Awal</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="planning">Planning (Perencanaan)</option>
                <option value="active">Active (Sedang Berjalan)</option>
                <option value="on_hold">On Hold (Ditunda)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">Nama Project *</label>
            <input 
              type="text"
              placeholder="Contoh: Renovasi Cabang Bandung & Setup POS"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">Deskripsi / Scope Project</label>
            <textarea 
              rows={3}
              placeholder="Jelaskan tujuan project, scope pekerjaan, atau deliverable..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Tanggal Mulai</label>
              <input 
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">Target Selesai (Deadline)</label>
              <input 
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Link href="/projects">
              <Button type="button" variant="outline" className="border-zinc-800 text-zinc-300 hover:bg-zinc-800">
                Batal
              </Button>
            </Link>
            <Button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 font-medium">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan & Buat Project
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
