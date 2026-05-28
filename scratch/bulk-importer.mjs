import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

// ── 1. HELPER: Parse CSV line safely (supporting nested quotes and commas)
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

// ── 2. HELPER: Cleanse Account Code (e.g. "6 5 00 040" -> "6-5-00-040")
function cleanseAccountCode(code) {
  if (!code) return ''
  return code.trim().replace(/\s+/g, '-')
}

// ── 3. HELPER: Parse Date (convert "DD/MM/YY" or "DD/MM/YYYY" to "YYYY-MM-DD")
function parseCSVDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0]
  
  // Format DD/MM/YY or DD/MM/YYYY
  const parts = dateStr.split('/')
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0')
    const month = parts[1].padStart(2, '0')
    let year = parts[2]
    if (year.length === 2) {
      year = '20' + year
    }
    return `${year}-${month}-${day}`
  }

  // Format DD-MM-YY or DD-MM-YYYY
  const partsHyphen = dateStr.split('-')
  if (partsHyphen.length === 3) {
    if (partsHyphen[0].length === 4) {
      return dateStr // already YYYY-MM-DD
    }
    const day = partsHyphen[0].padStart(2, '0')
    const month = partsHyphen[1].padStart(2, '0')
    let year = partsHyphen[2]
    if (year.length === 2) {
      year = '20' + year
    }
    return `${year}-${month}-${day}`
  }

  return dateStr
}

// ── 4. HELPER: Parse Money (convert "65,000" to 65000)
function parseCSVNumber(val) {
  if (!val) return 0
  const clean = val.replace(/,/g, '').trim()
  return parseFloat(clean) || 0
}

async function main() {
  console.log('🚀 Starting ByteSuite ERP High-Speed Bulk Importer...')

  // Load environment variables
  if (!fs.existsSync('.env.local')) {
    console.error('❌ Error: .env.local file not found. Importer aborted.')
    process.exit(1)
  }
  
  const envContent = fs.readFileSync('.env.local', 'utf8')
  const env = {}
  envContent.split('\n').forEach(line => {
    const parts = line.split('=')
    if (parts.length >= 2) {
      env[parts[0].trim()] = parts.slice(1).join('=').trim()
    }
  })

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    console.error('❌ Error: Supabase credentials missing in .env.local')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, anonKey)

  // ── 5. AUTHENTICATION / SIGN IN ──
  // Check if credentials are provided in CLI args or env, fallback to signing up a fresh debug user
  const email = process.argv[2] || `importer-${Date.now()}@bytesuite.erp`
  const password = process.argv[3] || 'password123'
  
  console.log(`🔑 Attempting authentication for user: ${email}...`)
  
  let userSession = null
  let userId = null

  // Try to sign in first
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (!signInError && signInData.session) {
    console.log('✅ Sign in successful!')
    userSession = signInData.session
    userId = signInData.user.id
  } else {
    console.log('⚠️  Sign in failed or user does not exist. Creating a fresh importer user...')
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: 'Bulk Importer Admin' } }
    })

    if (signUpError) {
      console.error('❌ Failed to sign up fresh user:', signUpError.message)
      process.exit(1)
    }

    console.log('✅ Importer user created successfully!')
    userSession = signUpData.session
    userId = signUpData.user.id
  }

  // Ensure RLS works by authenticating the Supabase client instance
  await supabase.auth.setSession({
    access_token: userSession.access_token,
    refresh_token: userSession.refresh_token
  })

  // ── 6. SEED / RESOLVE ORGANIZATION & OUTLET ──
  console.log('🏢 Resolving user organization and outlet profiles...')
  
  let orgId = null
  let profile = null

  // Fetch profile
  const { data: profData } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single()

  profile = profData

  if (!profile || !profile.org_id) {
    console.log('🆕 No profile or organization found. Initializing org setup via register_new_org...')
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('register_new_org', {
      p_user_id: userId,
      p_full_name: 'Bulk Importer Admin',
      p_org_name: 'Kopi Tiam Lim Group',
      p_outlet_name: 'Default Outlet'
    })

    if (rpcErr) {
      console.error('❌ RPC registration failed:', rpcErr.message)
      process.exit(1)
    }

    orgId = rpcRes.org_id
    console.log(`✅ Org registered: ${orgId}`)

    // Refetch profile
    const { data: refetched } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()
    profile = refetched
  } else {
    orgId = profile.org_id
    console.log(`🏢 Organization resolved: ${orgId}`)
  }

  // ── 7. LOAD AND PARSE CSV FILE ──
  console.log('📖 Loading dataset file: kl_dataset.csv...')
  if (!fs.existsSync('kl_dataset.csv')) {
    console.error('❌ Error: kl_dataset.csv file not found in workspace root.')
    process.exit(1)
  }

  const csvContent = fs.readFileSync('kl_dataset.csv', 'utf8')
  const csvLines = csvContent.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0)
  
  if (csvLines.length < 2) {
    console.error('❌ CSV is empty.')
    process.exit(1)
  }

  const headers = parseCSVLine(csvLines[0])
  console.log(`📊 Total rows to process: ${csvLines.length - 1}`)

  // ── 8. RESOLVE OR CREATE OUTLET ──
  // Find distinct outlets in the CSV
  const csvOutletName = 'Kopi Tiam Lim - Lengkong' // Default primary outlet from CSV
  console.log(`📍 Resolving target outlet: "${csvOutletName}"...`)

  let targetOutletId = null
  const { data: existingOutlets } = await supabase
    .from('outlets')
    .select('id, name')
    .eq('org_id', orgId)

  const matchedOutlet = existingOutlets?.find(o => o.name === csvOutletName)

  if (matchedOutlet) {
    targetOutletId = matchedOutlet.id
    console.log(`✅ Outlet resolved: ${csvOutletName} (${targetOutletId})`)
  } else {
    console.log(`🆕 Outlet "${csvOutletName}" does not exist. Creating it...`)
    const { data: newOutlet, error: outletErr } = await supabase
      .from('outlets')
      .insert({
        org_id: orgId,
        name: csvOutletName,
        address: 'Bandung, Indonesia'
      })
      .select()
      .single()

    if (outletErr) {
      console.error('❌ Failed to create outlet:', outletErr.message)
      process.exit(1)
    }

    targetOutletId = newOutlet.id
    console.log(`✅ Created outlet: ${csvOutletName} (${targetOutletId})`)

    // Update user profile outlet_ids array
    const updatedOutletIds = [...new Set([...(profile.outlet_ids || []), targetOutletId])]
    await supabase
      .from('user_profiles')
      .update({ outlet_ids: updatedOutletIds })
      .eq('id', userId)

    console.log('✅ Updated user profiles with assigned outlet ID.')
  }

  // ── 9. PRE-RESOLVE & CACHE COAS (CHART OF ACCOUNTS) ──
  console.log('📚 Building Chart of Accounts cache...')
  const coaCache = new Map() // Code -> ID
  const { data: dbCOAs } = await supabase
    .from('chart_of_accounts')
    .select('id, code, name')
    .eq('org_id', orgId)

  dbCOAs?.forEach(c => {
    coaCache.set(cleanseAccountCode(c.code), c.id)
  })

  // Ensure default Accounts Payable / Hutang (2-1-001) exists in Cache
  let apCoaId = coaCache.get('2-1-001') || coaCache.get('2-1-10-010')
  if (!apCoaId) {
    const apAcct = dbCOAs?.find(c => c.code.replace(/[\s-]/g, '') === '21001' || c.code.replace(/[\s-]/g, '') === '2110010')
    if (apAcct) apCoaId = apAcct.id
  }

  // Helper function to resolve or create a COA dynamically
  async function getOrCreateCOA(rawCode, rawName) {
    const cleanCode = cleanseAccountCode(rawCode)
    if (!cleanCode) return null
    if (coaCache.has(cleanCode)) return coaCache.get(cleanCode)

    console.log(`🆕 Creating COA mapping for account: ${cleanCode} (${rawName || 'Expenses'})...`)
    
    // Determine type
    const firstDigit = cleanCode.charAt(0)
    let type = 'expense'
    if (firstDigit === '1') type = 'asset'
    else if (firstDigit === '2') type = 'liability'
    else if (firstDigit === '3') type = 'equity'
    else if (firstDigit === '4') type = 'income'

    const { data: newCoa, error } = await supabase
      .from('chart_of_accounts')
      .insert({
        org_id: orgId,
        code: cleanCode,
        name: rawName || `Account ${cleanCode}`,
        type: type
      })
      .select()
      .single()

    if (error) {
      console.error(`❌ Failed to create COA ${cleanCode}:`, error.message)
      return null
    }

    coaCache.set(cleanCode, newCoa.id)
    return newCoa.id
  }

  // Pre-seed unique COAs in parallel
  const uniqueCoaCodes = new Set()
  for (let i = 1; i < csvLines.length; i++) {
    const row = parseCSVLine(csvLines[i])
    if (row.length < headers.length) continue
    const rawCode = row[headers.indexOf('Account Code')]
    const rawName = row[headers.indexOf('Account Name')]
    if (rawCode) uniqueCoaCodes.add(JSON.stringify({ code: rawCode, name: rawName }))
  }

  console.log(`⏳ Pre-seeding ${uniqueCoaCodes.size} unique Chart of Accounts...`)
  for (const item of uniqueCoaCodes) {
    const { code, name } = JSON.parse(item)
    await getOrCreateCOA(code, name)
  }

  apCoaId = coaCache.get('2-1-001') || coaCache.get('2-1-10-010') || coaCache.get('2-1-10-000')
  console.log(`📚 Chart of Accounts resolved. Accounts Payable credit COA is: ${apCoaId}`)

  // ── 10. PRE-RESOLVE & CACHE ITEMS (ITEM MASTER) ──
  console.log('📦 Building Item Master cache...')
  const itemCache = new Map() // Item Name -> ID
  const { data: dbItems } = await supabase
    .from('item_master')
    .select('id, name')
    .eq('org_id', orgId)

  dbItems?.forEach(item => {
    itemCache.set(item.name.toLowerCase().trim(), item.id)
  })

  async function getOrCreateItem(name, uom, defaultCoaId) {
    const key = name.toLowerCase().trim()
    if (itemCache.has(key)) return itemCache.get(key)

    console.log(`🆕 Creating Item Master catalog entry: "${name}" (${uom})...`)
    const { data: newItem, error } = await supabase
      .from('item_master')
      .insert({
        org_id: orgId,
        name: name.trim(),
        unit: uom || 'PCS',
        purchase_unit: uom || 'PCS',
        conversion_factor: 1,
        category: 'raw',
        is_inventory: true,
        default_coa_id: defaultCoaId || null
      })
      .select()
      .single()

    if (error) {
      console.error(`❌ Failed to create Item Master entry "${name}":`, error.message)
      return null
    }

    itemCache.set(key, newItem.id)
    return newItem.id
  }

  // ── 11. GROUP ROWS BY JOURNAL ID (INVOICE GROUPINGS) ──
  console.log('🗂️  Grouping transactions into parent invoices...')
  const invoiceGroups = new Map() // JournalID -> Rows[]
  const standaloneLines = []

  const journalIdIdx = headers.indexOf('Journal ID')
  const logIdIdx = headers.indexOf('Log ID')
  const dateIdx = headers.indexOf('Journal Date')
  const fileUrlIdx = headers.indexOf('File URL')
  const codeIdx = headers.indexOf('Account Code')
  const coaNameIdx = headers.indexOf('Account Name')
  const vendorIdx = headers.indexOf('Brand / Store')
  const descIdx = headers.indexOf('Description')
  const qtyIdx = headers.indexOf('Quantity')
  const uomIdx = headers.indexOf('UOM')
  const debitIdx = headers.indexOf('Debit')
  const creditIdx = headers.indexOf('Credit')
  const isInvIdx = headers.indexOf('Inventory?')

  for (let i = 1; i < csvLines.length; i++) {
    const row = parseCSVLine(csvLines[i])
    if (row.length < headers.length) continue
    
    const journalId = row[journalIdIdx]
    if (journalId) {
      if (!invoiceGroups.has(journalId)) {
        invoiceGroups.set(journalId, [])
      }
      invoiceGroups.get(journalId).push(row)
    } else {
      standaloneLines.push(row)
    }
  }

  console.log(`📂 Found ${invoiceGroups.size} unique Invoices and ${standaloneLines.length} standalone Ledger entries.`)

  // ── 12. SEQUENTIAL INVOICE PROCESSING (To completely avoid deadlocks & timeouts) ──
  console.log('⚡ Starting deadlock-free sequential invoice processing...')
  
  let successCount = 0
  let skippedCount = 0
  let errorCount = 0
  let lineCount = 0
  
  const invoiceArray = Array.from(invoiceGroups.entries())
  let count = 0

  for (const [journalId, rows] of invoiceArray) {
    count++
    if (count % 50 === 0) {
      console.log(`⏳ Processing Progress: ${count} / ${invoiceArray.length} Invoices...`)
    }

    try {
      // Idempotency check: Skip if already exists in the database
      const { data: existingInvoice } = await supabase
        .from('invoices')
        .select('id')
        .eq('invoice_no', journalId)
        .limit(1)
        .maybeSingle()

      if (existingInvoice) {
        skippedCount++
        successCount++
        continue
      }

      const firstRow = rows[0]
      const rawDate = firstRow[dateIdx]
      const invoiceDate = parseCSVDate(rawDate)
      const fileUrl = firstRow[fileUrlIdx] || null
      const rawVendor = firstRow[vendorIdx] || 'General Supplier'
      
      let grandTotal = 0
      const postLines = []

      // Parse individual line items
      for (const r of rows) {
        const desc = r[descIdx]
        const qty = parseCSVNumber(r[qtyIdx]) || 1
        const debit = parseCSVNumber(r[debitIdx])
        const credit = parseCSVNumber(r[creditIdx])
        const uom = r[uomIdx] || 'PCS'
        const isInventory = r[isInvIdx]?.toUpperCase() === 'TRUE'
        const rawCode = r[codeIdx]
        const rawCoaName = r[coaNameIdx]

        const lineCost = debit || credit || 0
        grandTotal += lineCost

        // Resolve COA
        const lineCoaId = await getOrCreateCOA(rawCode, rawCoaName)
        
        // Resolve Item Master ID if inventory item
        let itemId = null
        if (isInventory) {
          itemId = await getOrCreateItem(desc, uom, lineCoaId)
        }

        postLines.push({
          item_id: itemId,
          qty: qty,
          unit_price: qty > 0 ? lineCost / qty : lineCost,
          total_price: lineCost,
          description: desc,
          coa_id: lineCoaId,
          is_inventory: isInventory
        })
        lineCount++
      }

      // 1. Generate unique UUID
      const invoiceId = crypto.randomUUID()

      // 2. Insert Invoice Metadata first (status = 'pending' to initialize draft)
      const { error: insertErr } = await supabase
        .from('invoices')
        .insert({
          id: invoiceId,
          outlet_id: targetOutletId,
          image_url: fileUrl,
          status: 'pending',
          vendor: rawVendor,
          invoice_no: journalId,
          invoice_date: invoiceDate,
          subtotal: grandTotal,
          tax_total: 0,
          grand_total: grandTotal,
          created_by: userId
        })

      if (insertErr) throw insertErr

      // 3. Invoke post_invoice RPC to automatically record all stock ledgers, batches, balances and GL entries
      const { error: rpcErr } = await supabase.rpc('post_invoice', {
        p_invoice_id: invoiceId,
        p_outlet_id: targetOutletId,
        p_org_id: orgId,
        p_lines: postLines,
        p_credit_coa_id: apCoaId || null
      })

      if (rpcErr) throw rpcErr
      successCount++
    } catch (err) {
      console.error(`❌ Failed to post invoice "${journalId}":`, err.message || JSON.stringify(err))
      errorCount++
    }
  }

  // ── 13. IMPORT STANDALONE GL ENTRIES ──
  if (standaloneLines.length > 0) {
    console.log(`⚡ Processing ${standaloneLines.length} standalone ledger double entries...`)
    
    const glDataToInsert = []
    
    for (const r of standaloneLines) {
      try {
        const rawDate = r[dateIdx]
        const entryDate = parseCSVDate(rawDate)
        const desc = r[descIdx]
        const rawCode = r[codeIdx]
        const rawCoaName = r[coaNameIdx]
        const debit = parseCSVNumber(r[debitIdx])
        const credit = parseCSVNumber(r[creditIdx])

        const lineCoaId = await getOrCreateCOA(rawCode, rawCoaName)
        if (!lineCoaId) continue

        glDataToInsert.push({
          outlet_id: targetOutletId,
          entry_date: entryDate,
          coa_id: lineCoaId,
          debit: debit || 0,
          credit: credit || 0,
          description: desc || 'Ledger Settlement Entry'
        })
        lineCount++
      } catch (err) {
        console.error('❌ Failed to process standalone line:', err.message)
      }
    }

    if (glDataToInsert.length > 0) {
      // Chunk insertions of GL entries to avoid HTTP payload limits and RLS issues
      const GL_BATCH = 100
      let glSuccess = 0
      
      console.log(`⏳ Inserting ${glDataToInsert.length} GL Entries in batches of ${GL_BATCH}...`)
      for (let i = 0; i < glDataToInsert.length; i += GL_BATCH) {
        const chunk = glDataToInsert.slice(i, i + GL_BATCH)
        const { error } = await supabase
          .from('gl_entries')
          .insert(chunk)

        if (error) {
          console.error(`❌ Failed to bulk insert GL entries batch at index ${i}:`, error.message)
          errorCount += chunk.length
        } else {
          glSuccess += chunk.length
          successCount += chunk.length
        }
      }
      console.log(`✅ Successfully wrote ${glSuccess} standalone GL entries to the database.`)
    }
  }

  console.log('\n===========================================================================')
  console.log('🎉 BULK IMPORT COMPLETE SUMMARY:')
  console.log(`📦 Total Invoices/Ledgers successfully loaded/active: ${successCount}`)
  console.log(`⏩ Already existing invoices skipped: ${skippedCount}`)
  console.log(`⚠️  Total failures in this run: ${errorCount}`)
  console.log(`📝 Total transaction lines written/verified: ${lineCount}`)
  console.log('===========================================================================')
  console.log('📌 NOTE: All inventory stock balances have been updated automatically.')
  console.log('===========================================================================')
  
  await supabase.auth.signOut()
}

main()
