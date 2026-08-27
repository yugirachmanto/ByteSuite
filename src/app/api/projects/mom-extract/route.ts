import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

export async function POST(req: Request) {
  try {
    const { projectId, momText } = await req.json()

    if (!projectId || !momText) {
      return NextResponse.json({ error: 'Missing projectId or momText' }, { status: 400 })
    }

    const supabase = await createClient()

    // 1. Fetch user & profile org_id
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'Org not found' }, { status: 400 })
    }

    // 2. Fetch project & tasks
    const { data: project } = await supabase
      .from('pm_projects')
      .select('name, project_code')
      .eq('id', projectId)
      .single()

    const { data: tasks } = await supabase
      .from('pm_tasks')
      .select('id, task_number, title, status, progress_percent')
      .eq('project_id', projectId)

    // 3. Insert MoM document
    const { data: momDoc, error: momDocErr } = await supabase
      .from('pm_mom_documents')
      .insert({
        org_id: profile.org_id,
        project_id: projectId,
        uploaded_by: user.id,
        raw_text: momText
      })
      .select('id')
      .single()

    if (momDocErr || !momDoc) {
      return NextResponse.json({ error: momDocErr?.message || 'Failed to save MoM' }, { status: 500 })
    }

    // 4. Call OpenAI API to parse MoM text against active project tasks
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      // No OpenAI key configured — these are NOT real AI extractions from momText,
      // just a placeholder so the review flow has something to demo. Must be
      // clearly distinguishable from real output: 'none' confidence (never used
      // by the real prompt below, which only emits high/medium/low/none-as-no-match)
      // plus an explicit marker in the evidence text, since MomReviewPanel renders
      // both directly and a reviewer could otherwise apply fabricated progress
      // numbers to real tasks without realizing they aren't AI-derived.
      const dummyExtractions = (tasks || []).slice(0, 2).map((t, idx) => ({
        id: `ext-${Date.now()}-${idx}`,
        task_id: t.id,
        action: 'update_progress',
        suggested_data: { progress_percent: Math.min(100, (t.progress_percent || 0) + 20) },
        match_confidence: 'none' as const,
        evidence: `[SIMULATED — no AI API key configured, this is not derived from your MoM text] Placeholder progress bump for "${t.title}".`,
        review_status: 'pending_review'
      }))

      for (const ext of dummyExtractions) {
        await supabase.from('pm_mom_extractions').insert({
          org_id: profile.org_id,
          mom_id: momDoc.id,
          task_id: ext.task_id,
          action: ext.action,
          suggested_data: ext.suggested_data,
          match_confidence: ext.match_confidence,
          evidence: ext.evidence,
          review_status: 'pending_review'
        })
      }

      return NextResponse.json({ extractions: dummyExtractions })
    }

    const openai = new OpenAI({ apiKey })

    const systemPrompt = `You are an AI ERP Assistant for ByteSuite. Analyze the following Minutes of Meeting (MoM) text for project "${project?.name}".
Extract progress updates, status changes, or new task suggestions matching existing tasks.
Tasks list: ${JSON.stringify(tasks)}

Respond strictly in JSON format as an array of objects:
[
  {
    "task_id": "uuid of task or null",
    "action": "update_progress | update_status | suggest_new_task | no_action",
    "suggested_data": { "progress_percent": 75, "status": "in_progress" },
    "match_confidence": "high | medium | low | none",
    "evidence": "quote from MoM"
  }
]`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: momText }
      ],
      response_format: { type: 'json_object' }
    })

    const resultText = completion.choices[0].message.content || '{}'
    const parsed = JSON.parse(resultText)
    const items = parsed.extractions || parsed.items || (Array.isArray(parsed) ? parsed : [])

    const savedExtractions = []
    for (const item of items) {
      const { data: savedExt } = await supabase
        .from('pm_mom_extractions')
        .insert({
          org_id: profile.org_id,
          mom_id: momDoc.id,
          task_id: item.task_id || null,
          action: item.action || 'update_progress',
          suggested_data: item.suggested_data || {},
          match_confidence: item.match_confidence || 'medium',
          evidence: item.evidence || 'Berdasarkan MoM',
          review_status: 'pending_review'
        })
        .select('*')
        .single()

      if (savedExt) savedExtractions.push(savedExt)
    }

    return NextResponse.json({ extractions: savedExtractions })
  } catch (err: any) {
    console.error('MoM Extraction API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
