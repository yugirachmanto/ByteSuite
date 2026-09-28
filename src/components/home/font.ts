import { Outfit } from 'next/font/google'

// Scoped to the marketing homepage only — the dashboard keeps Inter
// (set globally in the root layout). Apply `displayFont.className` to a
// wrapping element, never to <body>.
export const displayFont = Outfit({ subsets: ['latin'], weight: ['500', '600', '700'] })
