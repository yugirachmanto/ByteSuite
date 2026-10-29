'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Printer, Bluetooth, Usb, ExternalLink, ScanLine, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// Diagnostic page: finds out which print route works on the POS terminal
// (Android handheld, 58mm thermal printer driven by the vendor's "HardWare
// Settings" app) so the real POS flow can be built on a route that is proven.

const ESC = 0x1b
const GS = 0x1d

function buildEscPos(): Uint8Array {
  const enc = new TextEncoder()
  const parts: number[] = []
  const push = (...b: number[]) => parts.push(...b)
  const text = (s: string) => parts.push(...enc.encode(s))

  push(ESC, 0x40) // init
  push(ESC, 0x61, 1) // center
  push(ESC, 0x45, 1) // bold on
  text('TEST CETAK\n')
  push(ESC, 0x45, 0)
  text('ByteSuite POS\n')
  push(ESC, 0x61, 0) // left
  text('--------------------------------\n') // 32 cols = 58mm
  text('Item A            1 x   10.000\n')
  text('Item B            2 x    5.000\n')
  text('--------------------------------\n')
  push(ESC, 0x61, 2) // right
  text('TOTAL  Rp 20.000\n')
  push(ESC, 0x61, 1)
  text('\nJika terbaca rapi, jalur ini OK\n\n\n\n')
  return new Uint8Array(parts)
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  bytes.forEach((b) => { bin += String.fromCharCode(b) })
  return btoa(bin)
}

const PRINT_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: 58mm auto; margin: 0 }
body { width: 58mm; margin: 0; padding: 3mm; box-sizing: border-box; font-family: monospace; font-size: 10.5px; color: #000 }
.c { text-align: center } .r { display: flex; justify-content: space-between }
hr { border: 0; border-top: 1px dashed #000 }
</style></head><body>
<p class="c"><b>TEST CETAK</b><br>ByteSuite POS</p><hr>
<div class="r"><span>Item A 1 x 10.000</span><span>10.000</span></div>
<div class="r"><span>Item B 2 x 5.000</span><span>10.000</span></div><hr>
<div class="r"><b>TOTAL</b><b>Rp 20.000</b></div><hr>
<p class="c">Jika terbaca rapi, jalur ini OK</p>
</body></html>`

export default function PrintTestPage() {
  const [log, setLog] = useState<string[]>([])
  const [env, setEnv] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [baud, setBaud] = useState('9600')
  const [scan, setScan] = useState('')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const addLog = (msg: string) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${msg}`, ...l])

  useEffect(() => {
    const nav = navigator as any
    setEnv({
      'User agent': navigator.userAgent,
      'Secure context (HTTPS)': String(window.isSecureContext),
      'Web Bluetooth': String('bluetooth' in nav),
      'Web Serial': String('serial' in nav),
      WebUSB: String('usb' in nav),
      'Web NFC': String('NDEFReader' in window),
      BarcodeDetector: String('BarcodeDetector' in window),
      'Camera (getUserMedia)': String(!!navigator.mediaDevices?.getUserMedia),
      'Screen (px)': `${window.screen.width}x${window.screen.height} @${window.devicePixelRatio}x`,
    })
  }, [])

  // A. Same-tab print through a hidden iframe (no new tab; the print dialog may still show).
  const printIframe = () => {
    const frame = iframeRef.current
    if (!frame) return
    frame.srcdoc = PRINT_HTML
    frame.onload = () => {
      addLog('A: iframe print dipanggil')
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
    }
  }

  // B. Web Bluetooth: pick a device, find a writable characteristic, send ESC/POS.
  const printBluetooth = async () => {
    const nav = navigator as any
    if (!nav.bluetooth) return addLog('B: Web Bluetooth tidak tersedia di browser ini')
    setBusy(true)
    try {
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb',
          '0000ff00-0000-1000-8000-00805f9b34fb',
          '0000ffe0-0000-1000-8000-00805f9b34fb',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455',
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
        ],
      })
      addLog(`B: dipilih "${device.name ?? device.id}"`)
      const server = await device.gatt.connect()
      const services = await server.getPrimaryServices()
      let target: any = null
      for (const s of services) {
        const chars = await s.getCharacteristics()
        for (const c of chars) {
          addLog(`B: service ${s.uuid} char ${c.uuid} write=${c.properties.write} wnr=${c.properties.writeWithoutResponse}`)
          if (!target && (c.properties.write || c.properties.writeWithoutResponse)) target = c
        }
      }
      if (!target) throw new Error('Tidak ada characteristic yang bisa ditulis')
      const data = buildEscPos()
      for (let i = 0; i < data.length; i += 100) {
        const chunk = data.slice(i, i + 100)
        if (target.properties.writeWithoutResponse) await target.writeValueWithoutResponse(chunk)
        else await target.writeValue(chunk)
      }
      addLog('B: data terkirim — cek kertas')
    } catch (e: any) {
      addLog(`B: gagal — ${e.name}: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  // C. Web Serial: pick a port and send ESC/POS.
  const printSerial = async () => {
    const nav = navigator as any
    if (!nav.serial) return addLog('C: Web Serial tidak tersedia di browser ini')
    setBusy(true)
    try {
      const port = await nav.serial.requestPort()
      await port.open({ baudRate: Number(baud) || 9600 })
      const writer = port.writable.getWriter()
      await writer.write(buildEscPos())
      writer.releaseLock()
      await port.close()
      addLog('C: data terkirim — cek kertas')
    } catch (e: any) {
      addLog(`C: gagal — ${e.name}: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  // D. RawBT (or any app registering the rawbt: scheme) takes ESC/POS bytes via intent.
  const printRawBt = () => {
    addLog('D: membuka rawbt: — jika tidak ada app yang menangani, tidak terjadi apa-apa')
    window.location.href = `rawbt:base64,${toBase64(buildEscPos())}`
  }

  return (
    <div className="mx-auto max-w-xl p-4 space-y-5 text-zinc-100">
      <div className="flex items-center justify-between">
        <Link href="/pos">
          <Button variant="ghost" className="text-zinc-400 hover:text-zinc-100">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to POS
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-lg font-semibold">Tes Cetak &amp; Perangkat</h1>
        <p className="text-sm text-zinc-500">Coba tiap jalur di terminal, lalu catat mana yang mencetak.</p>
      </div>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-1">
        <p className="text-xs font-medium uppercase text-zinc-500">Kemampuan browser</p>
        {Object.entries(env).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 text-xs">
            <span className="text-zinc-400 shrink-0">{k}</span>
            <span className="text-right break-all">{v}</span>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-3">
        <p className="text-xs font-medium uppercase text-zinc-500">Jalur cetak</p>
        <Button onClick={printIframe} className="w-full justify-start bg-indigo-600 text-white hover:bg-indigo-700">
          <Printer className="mr-2 h-4 w-4" /> A. Cetak di tab yang sama (window.print)
        </Button>
        <Button onClick={printBluetooth} disabled={busy} className="w-full justify-start bg-indigo-600 text-white hover:bg-indigo-700">
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bluetooth className="mr-2 h-4 w-4" />}
          B. Bluetooth langsung (ESC/POS)
        </Button>
        <div className="flex gap-2">
          <Button onClick={printSerial} disabled={busy} className="flex-1 justify-start bg-indigo-600 text-white hover:bg-indigo-700">
            <Usb className="mr-2 h-4 w-4" /> C. Serial / USB (ESC/POS)
          </Button>
          <Input
            value={baud}
            onChange={(e) => setBaud(e.target.value)}
            inputMode="numeric"
            aria-label="Baud rate"
            className="w-24 bg-zinc-950 border-zinc-800 text-zinc-100"
          />
        </div>
        <Button onClick={printRawBt} className="w-full justify-start bg-indigo-600 text-white hover:bg-indigo-700">
          <ExternalLink className="mr-2 h-4 w-4" /> D. Lewat RawBT (rawbt:)
        </Button>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
        <p className="text-xs font-medium uppercase text-zinc-500 flex items-center gap-1.5">
          <ScanLine className="h-3.5 w-3.5" /> Tes scanner barcode
        </p>
        <Input
          value={scan}
          onChange={(e) => setScan(e.target.value)}
          placeholder="Klik di sini lalu tekan tombol scan di terminal"
          className="bg-zinc-950 border-zinc-800 text-zinc-100"
        />
        <p className="text-xs text-zinc-500">Kalau kode muncul di kolom ini, scanner bekerja seperti keyboard.</p>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
        <p className="text-xs font-medium uppercase text-zinc-500 mb-2">Log</p>
        <pre className="text-xs whitespace-pre-wrap break-all text-zinc-300 max-h-64 overflow-y-auto">
          {log.length ? log.join('\n') : 'Belum ada aktivitas.'}
        </pre>
      </section>

      <iframe ref={iframeRef} title="print-frame" className="hidden" />
    </div>
  )
}
