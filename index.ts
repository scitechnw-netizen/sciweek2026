import { createClient } from 'npm:@supabase/supabase-js@2'

const allowedOrigin = Deno.env.get('ALLOWED_ORIGIN') || '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-password',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function cleanText(value: unknown, max = 500) {
  return String(value ?? '').trim().slice(0, max)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const expectedPassword = Deno.env.get('ADMIN_PASSWORD') || ''
  const suppliedPassword = req.headers.get('x-admin-password') || ''

  if (!expectedPassword || suppliedPassword !== expectedPassword) {
    return json({ ok: false, error: 'unauthorized', message: 'รหัสผ่านผู้ดูแลไม่ถูกต้อง' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!supabaseUrl || !serviceRole) {
    return json({ ok: false, error: 'server_config', message: 'Edge Function ยังตั้งค่า Supabase ไม่ครบ' }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  const action = cleanText(body?.action, 80)

  try {
    if (action === 'login') {
      return json({ ok: true })
    }

    if (action === 'students.list') {
      const { data, error } = await supabase
        .from('students')
        .select('id,student_code,prefix,first_name,last_name,class_name,is_active,created_at,updated_at')
        .order('student_code', { ascending: true })
        .limit(10000)
      if (error) throw error
      return json({ ok: true, rows: data ?? [] })
    }

    if (action === 'students.upsert') {
      const input = Array.isArray(body?.rows) ? body.rows : []
      if (!input.length) return json({ ok: false, error: 'empty_rows', message: 'ไม่มีข้อมูลนักเรียน' }, 400)
      if (input.length > 600) return json({ ok: false, error: 'too_many_rows', message: 'นำเข้าได้ครั้งละไม่เกิน 600 คน' }, 400)

      const rows = input
        .map((r: any) => ({
          student_code: cleanText(r.student_code, 80),
          prefix: cleanText(r.prefix, 40),
          first_name: cleanText(r.first_name, 120),
          last_name: cleanText(r.last_name, 120),
          class_name: cleanText(r.class_name, 80),
          is_active: r.is_active === false || String(r.is_active).toLowerCase() === 'false' ? false : true,
        }))
        .filter((r: any) => r.student_code && r.first_name)

      if (!rows.length) return json({ ok: false, error: 'invalid_rows', message: 'ไม่พบแถวที่มี student_code และ first_name' }, 400)

      const { data, error } = await supabase
        .from('students')
        .upsert(rows, { onConflict: 'student_code' })
        .select('student_code')
      if (error) throw error
      return json({ ok: true, count: data?.length ?? rows.length })
    }

    if (action === 'questions.list') {
      const { data, error } = await supabase
        .from('questions')
        .select('id,sign_number,question_slot,question_text,option_a,option_b,option_c,option_d,correct_option,is_active,updated_at')
        .order('sign_number', { ascending: true })
        .order('question_slot', { ascending: true })
        .limit(500)
      if (error) throw error
      return json({ ok: true, rows: data ?? [] })
    }

    if (action === 'questions.upsert') {
      const input = Array.isArray(body?.rows) ? body.rows : []
      if (!input.length) return json({ ok: false, error: 'empty_rows', message: 'ไม่มีข้อมูลข้อสอบ' }, 400)
      if (input.length > 129) return json({ ok: false, error: 'too_many_rows' }, 400)

      const rows = input.map((r: any) => {
        const sign = Number(r.sign_number)
        const slot = Number(r.question_slot)
        const correct = cleanText(r.correct_option, 1).toUpperCase()
        if (!Number.isInteger(sign) || sign < 1 || sign > 43) throw new Error('หมายเลขป้ายต้องอยู่ระหว่าง 1-43')
        if (!Number.isInteger(slot) || slot < 1 || slot > 3) throw new Error('ลำดับคำถามต้องอยู่ระหว่าง 1-3')
        if (!['A','B','C','D'].includes(correct)) throw new Error('คำตอบที่ถูกต้องต้องเป็น A, B, C หรือ D')
        return {
          sign_number: sign,
          question_slot: slot,
          question_text: cleanText(r.question_text, 1500),
          option_a: cleanText(r.option_a, 500),
          option_b: cleanText(r.option_b, 500),
          option_c: cleanText(r.option_c, 500),
          option_d: cleanText(r.option_d, 500),
          correct_option: correct,
          is_active: Boolean(r.is_active),
        }
      })

      const { data, error } = await supabase
        .from('questions')
        .upsert(rows, { onConflict: 'sign_number,question_slot' })
        .select('sign_number,question_slot')
      if (error) throw error
      return json({ ok: true, count: data?.length ?? rows.length })
    }

    if (action === 'results.list') {
      const { data, error } = await supabase
        .from('game_sessions')
        .select(`
          id,status,correct_count,wrong_count,chests_opened,started_at,ended_at,last_activity_at,
          students!inner(student_code,prefix,first_name,last_name,class_name)
        `)
        .order('started_at', { ascending: false })
        .limit(10000)
      if (error) throw error
      return json({ ok: true, rows: data ?? [] })
    }

    if (action === 'session.reset') {
      const studentCode = cleanText(body?.student_code, 80)
      if (!studentCode) return json({ ok: false, error: 'missing_student_code' }, 400)

      const { data: student, error: stError } = await supabase
        .from('students')
        .select('id,student_code')
        .eq('student_code', studentCode)
        .maybeSingle()
      if (stError) throw stError
      if (!student) return json({ ok: false, error: 'student_not_found', message: 'ไม่พบนักเรียน' }, 404)

      const { error } = await supabase.from('game_sessions').delete().eq('student_id', student.id)
      if (error) throw error
      return json({ ok: true, student_code: studentCode })
    }

    return json({ ok: false, error: 'unknown_action' }, 400)
  } catch (err) {
    console.error(err)
    return json({ ok: false, error: 'server_error', message: err instanceof Error ? err.message : String(err) }, 500)
  }
})
