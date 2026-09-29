import Image from 'next/image'
import { displayFont } from './font'

/**
 * Gradient runs darkest at the bottom edge (zinc-950 -> black) — the
 * "floor" of the page. The wordmark itself dissolves into that same
 * black via a mask gradient, so it reads as settling into the
 * background rather than sitting on top of it.
 */
export function Footer() {
  return (
    <footer className={`${displayFont.className} border-t border-white/[0.06] bg-gradient-to-b from-zinc-950 to-black`}>
      <div className="mx-auto flex max-w-6xl flex-col items-center px-6 py-20 sm:px-10">
        <Image
          src="/brand/wordmark.png"
          alt="ByteSuite"
          width={1374}
          height={393}
          className="h-24 w-auto sm:h-32"
          style={{
            maskImage: 'linear-gradient(to bottom, black 0%, black 55%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 55%, transparent 100%)',
          }}
        />
        <p className="mt-10 text-center text-xs text-zinc-600">
          © {new Date().getFullYear()} ByteSuite. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
