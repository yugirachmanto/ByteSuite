'use client'

import { useState, useEffect } from 'react'
import { X, Calendar } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { TaskComments } from './TaskComments'
import { TaskLinkPicker } from './TaskLinkPicker'
import { TimeTracker } from './TimeTracker'

export interface Task {
  id: string
  project_id: string
  org_id: string
  outlet_id: string
  title: string
  description: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'todo' | 'in_progress' | 'review' | 'done'
  start_date: string | null
  due_date: string | null
  position: number
  assignee_id: string | null
  created_at: string
}

interface TaskDetailDrawerProps {
  task: Task | null
  onClose: () => void
  onTaskUpdated: () => void
}

export function TaskDetailDrawer({ task, onClose, onTaskUpdated }: TaskDetailDrawerProps) {
  const supabase = createClient()
  const [status, setStatus] = useState<Task['status']>(task?.status || 'todo')
  const [priority, setPriority] = useState<Task['priority']>(task?.priority || 'medium')
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    if (task) {
      setStatus(task.status)
      setPriority(task.priority)
      // Hides the floating Sigma AI chat icon while the drawer covers the screen.
      window.dispatchEvent(new Event('task-drawer-open'))
    } else {
      window.dispatchEvent(new Event('task-drawer-close'))
    }
  }, [task])

  if (!task) return null

  const handleUpdateStatus = async (newStatus: Task['status']) => {
    setStatus(newStatus)
    setUpdating(true)

    const { error } = await supabase
      .from('pm_tasks')
      .update({ status: newStatus })
      .eq('id', task.id)

    setUpdating(false)
    if (!error) onTaskUpdated()
  }

  const handleUpdatePriority = async (newPriority: Task['priority']) => {
    setPriority(newPriority)
    setUpdating(true)

    const { error } = await supabase
      .from('pm_tasks')
      .update({ priority: newPriority })
      .eq('id', task.id)

    setUpdating(false)
    if (!error) onTaskUpdated()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-xl bg-zinc-950 border-l border-zinc-800 h-full flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-right duration-200">
        <div className="p-4 sm:p-5 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Detail Task</span>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-zinc-400 hover:text-zinc-100">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div>
            <h2 className="text-xl font-bold text-zinc-100">{task.title}</h2>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed whitespace-pre-wrap">
              {task.description || 'Tidak ada deskripsi detail.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 bg-zinc-900/40 border border-zinc-800/80 p-4 rounded-xl">
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">Status Task</label>
              <select
                value={status}
                onChange={(e) => handleUpdateStatus(e.target.value as Task['status'])}
                disabled={updating}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => handleUpdatePriority(e.target.value as Task['priority'])}
                disabled={updating}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs bg-zinc-900/60 p-3 rounded-xl border border-zinc-800/60">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <Calendar className="h-4 w-4 text-indigo-400" />
              <span>Due Date:</span>
            </div>
            <span className="font-mono text-zinc-200">
              {task.due_date ? new Date(task.due_date).toLocaleDateString('id-ID', { dateStyle: 'medium' }) : 'Flexible'}
            </span>
          </div>

          <TaskLinkPicker taskId={task.id} outletId={task.outlet_id} orgId={task.org_id} />

          <TimeTracker taskId={task.id} outletId={task.outlet_id} onLogged={onTaskUpdated} />

          <TaskComments taskId={task.id} outletId={task.outlet_id} />
        </div>
      </div>
    </div>
  )
}
