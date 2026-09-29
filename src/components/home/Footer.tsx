import Image from 'next/image'
import Link from 'next/link'
import { displayFont } from './font'

const FOOTER_LINKS = [
  { label: 'Products', href: '/#products' },
  { label: 'Solutions', href: '/#solutions' },
  { label: 'Pricing', href: '#' },
  { label: 'Login', href: '/login' },
  { label: 'Sign Up', href: '/register' },
]

/**
 * Gradient runs darkest at the bottom edge (zinc-950 -> black) — the
 * "floor" of the page, visually settling after the lighter, more active
 * sections above it.
 */
export function Footer() {
  return (
    <footer className={`${displayFont.className} border-t border-white/[0.06] bg-gradient-to-b from-zinc-950 to-black`}>
      <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
        <div className="flex flex-col items-center gap-8 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <Image src="/brand/wordmark.png" alt="ByteSuite" width={1374} height={393} className="h-8 w-auto" />
          <nav className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            {FOOTER_LINKS.map(l => (
              <Link key={l.label} href={l.href} className="text-sm text-zinc-400 transition-colors duration-150 hover:text-zinc-100">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-12 border-t border-white/[0.06] pt-8 text-center text-xs text-zinc-600 sm:text-left">
          © {new Date().getFullYear()} ByteSuite. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
