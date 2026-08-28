'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  FolderKanban,
  Plus,
  Search,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowRight,
  Filter,
  BarChart2
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useOutlet } from '@/lib/contexts/outlet-context'
import { Button } from '@/components/ui/button'

interface Project {
  id: string
  name: string
  description: string | null
  status: 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled'
  start_date: string | null
  end_date: string | null
  created_at: string
}

export default function ProjectsPage() {
  const router = useRouter()
  const supabase = createClient()
  const { selectedOutletId } = useOutlet()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const fetchProjects = async () => {
    if (!selectedOutletId) return
    setLoading(true)

    let query = supabase
      .from('pm_projects')
      .select('*')
      .eq('outlet_id', selectedOutletId)
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching projects:', error.message)
    } else {
      setProjects(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchProjects()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOutletId, statusFilter])

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const activeCount = projects.filter(p => p.status === 'active').length
  const planningCount = projects.filter(p => p.status === 'planning').length
  const completedCount = projects.filter(p => p.status === 'completed').length

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>
      case 'planning':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">Planning</span>
      case 'on_hold':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">On Hold</span>
      case 'completed':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">Completed</span>
      default:
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">{status}</span>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <FolderKanban className="h-6 w-6 text-indigo-400" />
            Project Management
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Kelola proyek, task, Kanban board, dan Gantt timeline per outlet.
          </p>
        </div>
        <Link href="/projects/new">
          <Button className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 font-medium">
            <Plus className="h-4 w-4" />
            Project Baru
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400 font-medium">Proyek Aktif</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{activeCount}</p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Clock className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400 font-medium">Perencanaan (Planning)</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{planningCount}</p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <BarChart2 className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-400 font-medium">Selesai (Completed)</p>
            <p className="text-2xl font-bold text-purple-400 mt-1">{completedCount}</p>
          </div>
          <div className="h-10 w-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Cari nama atau deskripsi project..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-zinc-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">Semua Status</option>
            <option value="active">Active</option>
            <option value="planning">Planning</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-zinc-500 text-sm">Loading projects...</div>
      ) : filteredProjects.length === 0 ? (
        <div className="bg-zinc-900/40 border border-zinc-800 border-dashed rounded-2xl p-12 text-center space-y-3">
          <FolderKanban className="h-12 w-12 text-zinc-600 mx-auto" />
          <h3 className="text-lg font-medium text-zinc-200">Belum ada proyek</h3>
          <p className="text-sm text-zinc-400 max-w-md mx-auto">
            Buat proyek baru untuk mengelola tugas tim, Kanban board, dan Gantt timeline.
          </p>
          <Link href="/projects/new">
            <Button className="mt-2 bg-indigo-600 hover:bg-indigo-500 text-white gap-2">
              <Plus className="h-4 w-4" />
              Buat Proyek Pertama
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              onClick={() => router.push(`/projects/${project.id}`)}
              className="group bg-zinc-900/70 hover:bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 rounded-2xl p-5 transition-all duration-200 cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  {getStatusBadge(project.status)}
                </div>

                <h3 className="font-semibold text-zinc-100 group-hover:text-indigo-400 transition-colors text-base line-clamp-1">
                  {project.name}
                </h3>

                <p className="text-xs text-zinc-400 mt-2 line-clamp-2 min-h-[2.5rem]">
                  {project.description || 'Tidak ada deskripsi.'}
                </p>
              </div>

              <div className="mt-5 pt-4 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-500">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>
                    {project.start_date ? new Date(project.start_date).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' }) : 'Flexible'}
                    {project.end_date ? ` - ${new Date(project.end_date).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-indigo-400 font-medium group-hover:translate-x-1 transition-transform">
                  <span>Detail</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
