'use client'

import { useState } from 'react'
import { Plus, Clock, Link2, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Task } from './TaskDetailDrawer'

interface TaskKanbanBoardProps {
  tasks: Task[]
  linkCounts: Record<string, number>
  timeTotals: Record<string, number>
  onSelectTask: (task: Task) => void
  onQuickCreateTask: (status: Task['status']) => void
  onMoveTask: (taskId: string, newStatus: Task['status']) => void
}

const COLUMNS: { id: Task['status']; label: string; color: string }[] = [
  { id: 'todo', label: 'To Do', color: 'border-zinc-700 text-zinc-400 bg-zinc-800/40' },
  { id: 'in_progress', label: 'In Progress', color: 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10' },
  { id: 'review', label: 'Review', color: 'border-amber-500/30 text-amber-400 bg-amber-500/10' },
  { id: 'done', label: 'Done', color: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' },
]

function formatMinutes(mins: number) {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function TaskKanbanBoard({ tasks, linkCounts, timeTotals, onSelectTask, onQuickCreateTask, onMoveTask }: TaskKanbanBoardProps) {
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<Task['status'] | null>(null)

  const handleDrop = (columnId: Task['status']) => {
    if (draggedTaskId) {
      const task = tasks.find((t) => t.id === draggedTaskId)
      if (task && task.status !== columnId) {
        onMoveTask(draggedTaskId, columnId)
      }
    }
    setDraggedTaskId(null)
    setDragOverColumn(null)
  }

  return (
    <div className="flex gap-3 w-full">
      {COLUMNS.map((column) => {
        const columnTasks = tasks.filter((t) => t.status === column.id)

        return (
          <div
            key={column.id}
            onDragOver={(e) => {
              e.preventDefault()
              if (dragOverColumn !== column.id) setDragOverColumn(column.id)
            }}
            onDragLeave={() => setDragOverColumn((prev) => (prev === column.id ? null : prev))}
            onDrop={(e) => {
              e.preventDefault()
              handleDrop(column.id)
            }}
            className={`flex flex-col bg-zinc-900/40 border rounded-2xl p-3 flex-1 min-w-0 max-h-[750px] transition-colors ${
              dragOverColumn === column.id ? 'border-indigo-500/60 bg-indigo-500/5' : 'border-zinc-800/80'
            }`}
          >
            <div className="flex items-center justify-between p-2 mb-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${column.color}`}>
                  {column.label}
                </span>
                <span className="text-xs font-mono text-zinc-500">({columnTasks.length})</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onQuickCreateTask(column.id)}
                className="h-6 w-6 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {columnTasks.length === 0 ? (
                <div className="py-8 text-center border border-dashed border-zinc-800/60 rounded-xl text-[11px] text-zinc-600">
                  Tidak ada task
                </div>
              ) : (
                columnTasks.map((task) => {
                  const linkCount = linkCounts[task.id] || 0
                  const timeTotal = timeTotals[task.id] || 0

                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => {
                        setDraggedTaskId(task.id)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnd={() => {
                        setDraggedTaskId(null)
                        setDragOverColumn(null)
                      }}
                      onClick={() => onSelectTask(task)}
                      className={`group bg-zinc-900 hover:bg-zinc-850 border border-zinc-800/90 hover:border-indigo-500/40 rounded-xl p-3.5 cursor-grab active:cursor-grabbing transition-all duration-150 space-y-2.5 shadow-xs ${
                        draggedTaskId === task.id ? 'opacity-40' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px]">
                        <span className={`font-semibold uppercase px-1.5 py-0.5 rounded ${
                          task.priority === 'urgent' ? 'bg-rose-500/20 text-rose-400' :
                          task.priority === 'high' ? 'bg-amber-500/20 text-amber-400' :
                          'text-zinc-400'
                        }`}>
                          {task.priority}
                        </span>
                      </div>

                      <h4 className="text-xs font-semibold text-zinc-200 group-hover:text-indigo-300 transition-colors line-clamp-2">
                        {task.title}
                      </h4>

                      <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500">
                        {task.due_date ? (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-zinc-400" />
                            {new Date(task.due_date).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' })}
                          </span>
                        ) : (
                          <span>No deadline</span>
                        )}

                        <div className="flex items-center gap-2.5">
                          {timeTotal > 0 && (
                            <span className="flex items-center gap-1 text-zinc-400">
                              <Timer className="h-3 w-3" />
                              {formatMinutes(timeTotal)}
                            </span>
                          )}
                          {linkCount > 0 && (
                            <span className="flex items-center gap-1 text-zinc-400">
                              <Link2 className="h-3 w-3" />
                              {linkCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
