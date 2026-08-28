'use client'

import { useState, useEffect, useRef } from 'react'
import { Send, User, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

interface Comment {
  id: string
  task_id: string
  author_id: string | null
  message: string
  created_at: string
}

interface TaskCommentsProps {
  taskId: string
  outletId: string
}

export function TaskComments({ taskId, outletId }: TaskCommentsProps) {
  const supabase = createClient()
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [inputMessage, setInputMessage] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchComments = async () => {
    const { data, error } = await supabase
      .from('pm_task_comments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Fetch comments error:', error.message)
    } else {
      setComments(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchComments()

    const channel = supabase
      .channel(`pm_task_comments:${taskId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pm_task_comments', filter: `task_id=eq.${taskId}` },
        (payload) => {
          const incoming = payload.new as Comment
          setComments((prev) => (prev.some((c) => c.id === incoming.id) ? prev : [...prev, incoming]))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  useEffect(() => {
    scrollToBottom()
  }, [comments])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputMessage.trim() || sending) return

    const msgText = inputMessage.trim()
    setInputMessage('')
    setSending(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.error('Cannot send message: no authenticated user')
        return
      }

      const { data, error } = await supabase
        .from('pm_task_comments')
        .insert({
          task_id: taskId,
          outlet_id: outletId,
          author_id: user.id,
          message: msgText,
        })
        .select()
        .single()

      if (error) {
        console.error('Error posting comment:', error.message)
      } else if (data) {
        // Realtime may not be enabled for this table in every environment —
        // append locally so the sender always sees their own comment immediately.
        setComments((prev) => (prev.some((c) => c.id === data.id) ? prev : [...prev, data as Comment]))
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-[400px] bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="p-3.5 bg-zinc-900/80 border-b border-zinc-800">
        <span className="text-xs font-semibold text-zinc-200">Diskusi & Catatan Task</span>
      </div>

      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        {loading ? (
          <div className="text-center text-xs text-zinc-500 py-8">Loading diskusi...</div>
        ) : comments.length === 0 ? (
          <div className="text-center text-xs text-zinc-500 py-12">
            Belum ada diskusi untuk task ini.
          </div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="flex gap-2.5 items-start">
              <div className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold bg-zinc-800 text-zinc-300">
                <User className="h-4 w-4" />
              </div>

              <div className="flex-1 space-y-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-300">Tim</span>
                  <span className="text-[10px] text-zinc-500">
                    {new Date(comment.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed">
                  {comment.message}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="p-3 bg-zinc-900/60 border-t border-zinc-800 flex gap-2">
        <input
          type="text"
          placeholder="Ketik komentar..."
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
        />
        <Button
          type="submit"
          disabled={sending || !inputMessage.trim()}
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-500 text-white shrink-0 px-3"
        >
          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </Button>
      </form>
    </div>
  )
}
