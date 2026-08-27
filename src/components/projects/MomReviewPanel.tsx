'use client'

import { useState } from 'react'
import { FileText, Sparkles, Check, Trash2, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

interface MomExtraction {
  id: string
  task_id: string | null
  action: 'update_progress' | 'update_status' | 'suggest_new_task' | 'no_action'
  suggested_data: any
  match_confidence: 'high' | 'medium' | 'low' | 'none'
  evidence: string
  review_status: 'pending_review' | 'applied' | 'discarded'
}

interface MomReviewPanelProps {
  projectId: string
  onTasksUpdated: () => void
}

export function MomReviewPanel({ projectId, onTasksUpdated }: MomReviewPanelProps) {
  const supabase = createClient()
  const [momText, setMomText] = useState('')
  const [processing, setProcessing] = useState(false)
  const [extractions, setExtractions] = useState<MomExtraction[]>([])
  const [message, setMessage] = useState('')

  const handleExtractMoM = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!momText.trim() || processing) return

    setProcessing(true)
    setMessage('')

    try {
      const res = await fetch('/api/projects/mom-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          momText
        })
      })

      const data = await res.json()
      if (data.extractions) {
        setExtractions(data.extractions)
        setMessage('AI berhasil mengekstrak usulan dari MoM!')
      } else if (data.error) {
        setMessage(`Gagal mengekstrak: ${data.error}`)
      }
    } catch (err: any) {
      setMessage(`Terjadi kesalahan: ${err.message}`)
    }

    setProcessing(false)
  }

  const handleApplyExtraction = async (ext: MomExtraction) => {
    if (!ext.task_id && ext.action !== 'suggest_new_task') return

    if (ext.task_id && ext.suggested_data) {
      // Update task in pm_tasks
      await supabase
        .from('pm_tasks')
        .update({
          ...ext.suggested_data,
          updated_at: new Date().toISOString()
        })
        .eq('id', ext.task_id)

      // Add audit comment
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = user
        ? await supabase.from('user_profiles').select('org_id').eq('id', user.id).single()
        : { data: null }

      if (profile?.org_id) {
        await supabase.from('pm_task_comments').insert({
          org_id: profile.org_id,
          task_id: ext.task_id,
          author_type: 'ai',
          message: `Progress/status diupdate otomatis dari hasil MoM: "${ext.evidence}"`
        })
      }
    }

    // Update extraction status
    setExtractions((prev) =>
      prev.map((item) => (item.id === ext.id ? { ...item, review_status: 'applied' } : item))
    )

    onTasksUpdated()
  }

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-zinc-100">AI Ingestion Minutes of Meeting (MoM)</h3>
          <p className="text-xs text-zinc-400">Paste hasil notulen rapat. AI akan mencocokkan & mengusulkan update progress task.</p>
        </div>
      </div>

      {/* Input MoM Form */}
      <form onSubmit={handleExtractMoM} className="space-y-3">
        <textarea
          rows={4}
          placeholder="Paste isi MoM atau ringkasan hasil meeting di sini..."
          value={momText}
          onChange={(e) => setMomText(e.target.value)}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
        />

        <div className="flex items-center justify-between">
          <span className="text-xs text-indigo-400 font-medium">{message}</span>
          <Button 
            type="submit" 
            disabled={processing || !momText.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 text-white gap-2 text-xs font-medium"
          >
            {processing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Ekstrak Update dari MoM
          </Button>
        </div>
      </form>

      {/* AI Proposed Extractions List */}
      {extractions.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-zinc-800">
          <h4 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Usulan Update Progress (AI Propose, User Apply)</h4>

          <div className="space-y-2.5">
            {extractions.map((ext) => (
              <div 
                key={ext.id}
                className="bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-indigo-400 uppercase">{ext.action.replace('_', ' ')}</span>
                    <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                      Confidence: {ext.match_confidence}
                    </span>
                  </div>
                  <p className="text-zinc-300 italic">"{ext.evidence}"</p>
                  {ext.suggested_data && (
                    <div className="text-[11px] font-mono text-zinc-400">
                      Saran: {JSON.stringify(ext.suggested_data)}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {ext.review_status === 'applied' ? (
                    <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                      <Check className="h-4 w-4" /> Applied
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleApplyExtraction(ext)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1"
                    >
                      <Check className="h-3.5 w-3.5" /> Apply Update
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
