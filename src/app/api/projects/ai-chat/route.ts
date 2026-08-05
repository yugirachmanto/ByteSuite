import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

export async function POST(req: Request) {
  try {
    const { taskId, userMessage, orgId } = await req.json()

    if (!taskId || !userMessage || !orgId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    const supabase = await createClient()

    // 1. Fetch Task context & previous comments
    const { data: task } = await supabase
      .from('pm_tasks')
      .select('*, pm_projects(name, project_code)')
      .eq('id', taskId)
      .single()

    const { data: comments } = await supabase
      .from('pm_task_comments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true })
      .limit(10)

    let aiReplyText = ''

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      // Fallback response if no OpenAI API Key
      aiReplyText = `[AI Assistant]: Halo! Saya telah meninjau task "${task?.title || 'Task'}" (${task?.task_number}). Status saat ini "${task?.status}" dengan progress ${task?.progress_percent}%. Silakan koordinasikan dengan assignee untuk langkah berikutnya.`
    } else {
      const openai = new OpenAI({ apiKey })
      const contextPrompt = `You are ByteSuite ERP AI Assistant. Task details:
- Number: ${task?.task_number}
- Title: ${task?.title}
- Description: ${task?.description || 'N/A'}
- Status: ${task?.status}
- Progress: ${task?.progress_percent}%
- Priority: ${task?.priority}

Previous comments:
${(comments || []).map(c => `${c.author_type}: ${c.message}`).join('\n')}

Provide a helpful, concise, professional response in Indonesian addressing the user's inquiry.`

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: contextPrompt },
          { role: 'user', content: userMessage }
        ]
      })

      aiReplyText = completion.choices[0].message.content || 'Maaf, saya tidak dapat memproses permintaan ini.'
    }

    // 2. Insert AI response into pm_task_comments
    const { data: aiComment, error: insertErr } = await supabase
      .from('pm_task_comments')
      .insert({
        org_id: orgId,
        task_id: taskId,
        author_type: 'ai',
        message: aiReplyText
      })
      .select('*')
      .single()

    if (insertErr) {
      console.error('Insert AI comment error:', insertErr.message)
    }

    return NextResponse.json({ success: true, reply: aiComment })
  } catch (err: any) {
    console.error('AI Chat route error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
