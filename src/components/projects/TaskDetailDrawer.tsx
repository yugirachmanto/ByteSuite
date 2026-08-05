'use client'

import { useState, useEffect } from 'react'
import { 
  X, 
  Calendar, 
  User, 
  CheckCircle2, 
  Clock, 
  Paperclip, 
  AlertTriangle,
  Upload,
  ShieldCheck,
  Loader2,
  Trash2
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { TaskChatThread } from './TaskChatThread'

export interface Task {
  id: string
  task_number: string
  project_id: string
  title: string
  description: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done'
  start_date: string | null
  due_date: string | null
  progress_percent: number
  approval_status: 'not_required' | 'pending' | 'approved' | 'rejected'
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
  const [updating, setUpdating] = useState(false)
  const [attachments, setAttachments] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)

  // Local state for editable fields
  const [status, setStatus] = useState(task?.status || 'todo')
  const [progress, setProgress] = useState(task?.progress_percent || 0)
  const [priority, setPriority] = useState(task?.priority || 'medium')

  useEffect(() => {
    if (task) {
      setStatus(task.status)
      setProgress(task.progress_percent)
      setPriority(task.priority)
      fetchAttachments()
    }
  }, [task])

  if (!task) return null

  const fetchAttachments = async () => {
    const { data } = await supabase
      .from('pm_task_attachments')
      .select('*')
      .eq('task_id', task.id)
      .order('created_at', { ascending: false })
    
    setAttachments(data || [])
  }

  const handleUpdateStatus = async (newStatus: Task['status']) => {
    setStatus(newStatus)
    setUpdating(true)
    let newProgress = progress
    if (newStatus === 'done') newProgress = 100
    if (newStatus === 'todo') newProgress = 0

    const { error } = await supabase
      .from('pm_tasks')
      .update({
        status: newStatus,
        progress_percent: newProgress,
        updated_at: new Date().toISOString()
      })
      .eq('id', task.id)

    setUpdating(false)
    if (!error) onTaskUpdated()
  }

  const handleUpdateProgress = async (newProgress: number) => {
    setProgress(newProgress)
    setUpdating(true)
    let newStatus = status
    if (newProgress === 100) newStatus = 'done'
    else if (newProgress > 0 && newStatus === 'todo') newStatus = 'in_progress'

    const { error } = await supabase
      .from('pm_tasks')
      .update({
        progress_percent: newProgress,
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', task.id)

    setUpdating(false)
    if (!error) onTaskUpdated()
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    const file = files[0]
    const fileExt = file.name.split('.').pop()
    const filePath = `attachments/${task.id}/${Date.now()}.${fileExt}`

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) return

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('pm-attachments')
      .upload(filePath, file)

    if (uploadError) {
      console.warn('Storage upload error (fallback DB entry):', uploadError.message)
    }

    // Save Attachment Record
    await supabase.from('pm_task_attachments').insert({
      org_id: profile.org_id,
      task_id: task.id,
      file_path: filePath,
      file_name: file.name,
      mime_type: file.type,
      file_size: file.size,
      uploaded_by: user.id
    })

    setUploading(false)
    fetchAttachments()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-xl bg-zinc-950 border-l border-zinc-800 h-full flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-800 text-indigo-400 border border-zinc-700">
              {task.task_number}
            </span>
            {task.approval_status !== 'not_required' && (
              <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
                task.approval_status === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                task.approval_status === 'rejected' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}>
                Approval: {task.approval_status}
              </span>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-zinc-400 hover:text-zinc-100">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Drawer Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Title & Description */}
          <div>
            <h2 className="text-xl font-bold text-zinc-100">{task.title}</h2>
            <p className="text-xs text-zinc-400 mt-2 leading-relaxed whitespace-pre-wrap">
              {task.description || 'Tidak ada deskripsi detail.'}
            </p>
          </div>

          {/* Quick Controls Grid */}
          <div className="grid grid-cols-2 gap-4 bg-zinc-900/40 border border-zinc-800/80 p-4 rounded-xl">
            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">Status Task</label>
              <select
                value={status}
                onChange={(e) => handleUpdateStatus(e.target.value as Task['status'])}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="in_review">In Review</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">Priority</label>
              <span className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-lg uppercase ${
                priority === 'urgent' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                priority === 'high' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                'bg-zinc-800 text-zinc-300'
              }`}>
                {priority}
              </span>
            </div>
          </div>

          {/* Progress Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400 font-medium">Progress Pengerjaan</span>
              <span className="text-indigo-400 font-mono font-bold">{progress}%</span>
            </div>
            <input 
              type="range"
              min="0"
              max="100"
              step="5"
              value={progress}
              onChange={(e) => handleUpdateProgress(Number(e.target.value))}
              className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>

          {/* Dates & Timeline */}
          <div className="flex items-center justify-between text-xs bg-zinc-900/60 p-3 rounded-xl border border-zinc-800/60">
            <div className="flex items-center gap-1.5 text-zinc-400">
              <Calendar className="h-4 w-4 text-indigo-400" />
              <span>Due Date:</span>
            </div>
            <span className="font-mono text-zinc-200">
              {task.due_date ? new Date(task.due_date).toLocaleDateString('id-ID', { dateStyle: 'medium' }) : 'Flexible'}
            </span>
          </div>

          {/* File Attachments */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
                <Paperclip className="h-4 w-4 text-indigo-400" />
                Lampiran File ({attachments.length})
              </span>
              <label className="cursor-pointer text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1">
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                Upload File
                <input type="file" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>

            {attachments.length === 0 ? (
              <p className="text-xs text-zinc-500 italic py-2">Belum ada lampiran file.</p>
            ) : (
              <div className="space-y-1.5">
                {attachments.map((att) => (
                  <div key={att.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-800 p-2.5 rounded-lg text-xs">
                    <span className="text-zinc-200 truncate max-w-[280px]">{att.file_name}</span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {att.file_size ? `${(att.file_size / 1024).toFixed(0)} KB` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Realtime Chat Component */}
          <TaskChatThread taskId={task.id} taskTitle={task.title} />
        </div>
      </div>
    </div>
  )
}
