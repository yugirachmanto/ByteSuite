import fs from 'fs'
import readline from 'readline'

async function search() {
  const fileStream = fs.createReadStream('C:\\Users\\HP\\.gemini\\antigravity\\brain\\bbbad9fe-a86c-474f-ab30-00865ee84167\\.system_generated\\logs\\transcript.jsonl')
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  })

  for await (const line of rl) {
    if (line.includes('run_command') && (line.includes('.sql') || line.includes('supabase') || line.includes('migration') || line.includes('psql'))) {
      try {
        const obj = JSON.parse(line)
        if (obj.tool_calls) {
          obj.tool_calls.forEach(tc => {
            if (tc.name === 'run_command') {
              const cmd = tc.args?.CommandLine ? JSON.parse(tc.args.CommandLine) : null
              if (cmd) {
                console.log(`[Step ${obj.step_index}] command:`, cmd)
              }
            }
          })
        }
      } catch (e) {}
    }
  }
}

search()
