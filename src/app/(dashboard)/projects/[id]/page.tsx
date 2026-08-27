'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Plus, 
  FolderKanban, 
  Layers, 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  Settings, 
  Loader2,
  Calendar,
  Pencil,
  Check,
  X
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { TaskKanbanBoard } from '@/components/projects/TaskKanbanBoard'
import { TaskDetailDrawer, Task } from '@/components/projects/TaskDetailDrawer'
import { ProjectGanttView } from '@/components/projects/ProjectGanttView'
import { MomReviewPanel } from '@/components/projects/MomReviewPanel'

interface ProjectDetailProps {
  params: Promise<{ id: string }>
}

export default function ProjectDetailPage({ params }: ProjectDetailProps) {
  const { id: projectId } = use(params)
  const router = useRouter()
  const supabase = createClient()

  const [project, setProject] = useState<any>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'board' | 'gantt' | 'mom'>('board')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  // Inline Project Edit
  const [isEditingProject, setIsEditingProject] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [savingProject, setSavingProject] = useState(false)
  
  // Quick Task Modal
  const [isCreatingTask, setIsCreatingTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskStatus, setNewTaskStatus] = useState<Task['status']>('todo')
  const [savingTask, setSavingTask] = useState(false)

  const fetchProjectAndTasks = async () => {
    setLoading(true)

    // Fetch Project
    const { data: projData, error: projErr } = await supabase
      .from('pm_projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (projErr || !projData) {
      console.error('Fetch project error:', projErr?.message)
      setLoading(false)
      return
    }

    setProject(projData)

    // Fetch Tasks
    const { data: taskData } = await supabase
      .from('pm_tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })

    setTasks(taskData || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchProjectAndTasks()
  }, [projectId])

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskTitle.trim() || savingTask) return

    setSavingTask(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.error('Cannot create task: no authenticated user')
        return
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('org_id')
        .eq('id', user.id)
        .single()

      if (!profile?.org_id) {
        console.error('Cannot create task: no organization found for user')
        return
      }

      const { error } = await supabase
        .from('pm_tasks')
        .insert({
          org_id: profile.org_id,
          project_id: projectId,
          title: newTaskTitle.trim(),
          status: newTaskStatus,
          reporter_id: user.id
        })

      if (!error) {
        setNewTaskTitle('')
        setIsCreatingTask(false)
        fetchProjectAndTasks()
      }
    } finally {
      setSavingTask(false)
    }
  }

  const handleMoveTask = async (taskId: string, newStatus: Task['status']) => {
    const previousTasks = tasks
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return

    // Mirrors TaskDetailDrawer's handleUpdateStatus convention: done forces
    // progress to 100, todo forces it back to 0.
    let newProgress = task.progress_percent
    if (newStatus === 'done') newProgress = 100
    if (newStatus === 'todo') newProgress = 0

    // Optimistic update — a drag gesture is a poor place for a loading spinner,
    // and fetchProjectAndTasks() would flash the whole page's loading state.
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus, progress_percent: newProgress } : t))
    )

    const { error } = await supabase
      .from('pm_tasks')
      .update({
        status: newStatus,
        progress_percent: newProgress,
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId)

    if (error) {
      console.error('Failed to move task:', error.message)
      setTasks(previousTasks)
    }
  }

  const handleStartEdit = () => {
    setEditName(project.name)
    setEditDescription(project.description || '')
    setIsEditingProject(true)
  }

  const handleCancelEdit = () => {
    setIsEditingProject(false)
  }

  const handleSaveProject = async () => {
    if (!editName.trim() || savingProject) return
    setSavingProject(true)

    const { error } = await supabase
      .from('pm_projects')
      .update({
        name: editName.trim(),
        description: editDescription.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', projectId)

    setSavingProject(false)
    if (!error) {
      setProject({ ...project, name: editName.trim(), description: editDescription.trim() || null })
      setIsEditingProject(false)
    }
  }

  if (loading) {
    return <div className="py-20 text-center text-zinc-500 text-sm">Loading project detail...</div>
  }

  if (!project) {
    return (
      <div className="py-20 text-center space-y-4">
        <p className="text-zinc-400">Project tidak ditemukan.</p>
        <Link href="/projects">
          <Button variant="outline" className="border-zinc-800 text-zinc-300">Kembali ke Projects</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link href="/projects" className="text-zinc-500 hover:text-zinc-300 transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-800 text-indigo-400 border border-zinc-700">
              {project.project_code}
            </span>
            <span className="text-xs uppercase font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {project.status}
            </span>
          </div>
          {/* Inline Edit Mode */}
          {isEditingProject ? (
            <div className="space-y-2 mt-1">
              <input
                autoFocus
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full bg-zinc-900 border border-indigo-500/60 rounded-xl px-3 py-2 text-xl font-bold text-zinc-100 focus:outline-none"
              />
              <textarea
                rows={2}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Deskripsi project..."
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveProject}
                  disabled={savingProject || !editName.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 text-xs"
                >
                  {savingProject ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Simpan
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancelEdit}
                  className="text-zinc-400 hover:text-zinc-100 text-xs gap-1.5"
                >
                  <X className="h-3.5 w-3.5" />
                  Batal
                </Button>
              </div>
            </div>
          ) : (
            <div className="group/title flex items-start gap-2">
              <div>
                <h1 className="text-2xl font-bold text-zinc-100">{project.name}</h1>
                <p className="text-xs text-zinc-400 max-w-2xl mt-0.5">{project.description || 'Tidak ada deskripsi.'}</p>
              </div>
              <button
                onClick={handleStartEdit}
                className="mt-1 opacity-0 group-hover/title:opacity-100 transition-opacity text-zinc-500 hover:text-indigo-400"
                title="Edit nama & deskripsi project"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleStartEdit}
            variant="outline"
            className="border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 gap-2 font-medium text-xs"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit Project
          </Button>
          <Button
            onClick={() => {
              setNewTaskStatus('todo')
              setIsCreatingTask(true)
            }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 font-medium text-xs"
          >
            <Plus className="h-4 w-4" />
            Tambah Task Baru
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-zinc-800 gap-1">
        <button
          onClick={() => setActiveTab('board')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'board'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <FolderKanban className="h-4 w-4" />
          Kanban Task Board
        </button>

        <button
          onClick={() => setActiveTab('gantt')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'gantt'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Layers className="h-4 w-4" />
          Gantt Chart Timeline
        </button>

        <button
          onClick={() => setActiveTab('mom')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'mom'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          AI Ingestion MoM
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'board' && (
        <TaskKanbanBoard
          tasks={tasks}
          onSelectTask={(t) => setSelectedTask(t)}
          onQuickCreateTask={(st) => {
            setNewTaskStatus(st)
            setIsCreatingTask(true)
          }}
          onMoveTask={handleMoveTask}
        />
      )}

      {activeTab === 'gantt' && (
        <ProjectGanttView
          tasks={tasks}
          onSelectTask={(t) => setSelectedTask(t)}
        />
      )}

      {activeTab === 'mom' && (
        <MomReviewPanel
          projectId={projectId}
          onTasksUpdated={fetchProjectAndTasks}
        />
      )}

      {/* Quick Task Modal */}
      {isCreatingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-zinc-100">Tambah Task Baru</h3>

            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Judul Task *</label>
                <input
                  type="text"
                  placeholder="Contoh: Integrasi API Payment Gateway"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  autoFocus
                  required
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Status Awal</label>
                <select
                  value={newTaskStatus}
                  onChange={(e) => setNewTaskStatus(e.target.value as Task['status'])}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="in_review">In Review</option>
                  <option value="blocked">Blocked</option>
                  <option value="done">Done</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCreatingTask(false)}
                  className="border-zinc-800 text-zinc-300 text-xs"
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  disabled={savingTask || !newTaskTitle.trim()}
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs gap-1.5"
                >
                  {savingTask && <Loader2 className="h-3 w-3 animate-spin" />}
                  Simpan Task
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Detail Drawer */}
      <TaskDetailDrawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onTaskUpdated={fetchProjectAndTasks}
      />
    </div>
  )
}
