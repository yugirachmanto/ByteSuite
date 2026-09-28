'use client'

import Link from 'next/link'
import { LogoMark } from '@/components/brand/LogoMark'
import { displayFont } from './font'

const NAV_LINKS = [
  { label: 'Products', href: '/#products' },
  { label: 'Solutions', href: '/#solutions' },
  { label: 'Pricing', href: '#' },
]

/**
 * Shared across the homepage and the auth pages so the header never
 * drifts between them. `hideCta` suppresses the link to whichever auth
 * page is currently active — showing "Login" on /login would be
 * redundant.
 */
export function SiteHeader({ hideCta }: { hideCta?: 'login' | 'register' }) {
  return (
    <header className={`${displayFont.className} sticky top-0 z-40 border-b border-white/[0.06] bg-zinc-950/70 backdrop-blur-xl backdrop-saturate-150`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:px-10">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark className="h-7 w-7" />
          <span className="text-lg font-semibold tracking-[-0.01em] text-zinc-100">ByteSuite</span>
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map(item => (
            <Link key={item.label} href={item.href} className="text-sm font-medium text-zinc-400 transition-colors duration-150 hover:text-zinc-100">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {hideCta !== 'login' && (
            <Link href="/login" className="text-sm font-medium text-zinc-400 transition-colors duration-150 hover:text-zinc-100">
              Login
            </Link>
          )}
          {hideCta !== 'register' && (
            <Link
              href="/register"
              className="inline-flex h-9 items-center justify-center rounded-full bg-white/10 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-white/15"
            >
              Sign Up
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
