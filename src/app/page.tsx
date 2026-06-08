"use client"

import * as React from "react"
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { Button, buttonVariants } from '@/components/ui/button'
import { Menu, X, Zap, BrainCircuit, Calculator, Package, CreditCard, ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { ShadowOverlay } from '@/components/ui/shadow-overlay'

const menuItems = [
    { name: 'Features', href: '#' },
    { name: 'Solution', href: '#solution' },
    { name: 'Pricing', href: '#' },
    { name: 'About', href: '#' },
]

export default function HeroSection() {
    const [menuState, setMenuState] = React.useState(false)
    const router = useRouter()

    React.useEffect(() => {
        if (typeof window !== 'undefined' && (window.location.hash.includes('type=invite') || window.location.hash.includes('type=recovery'))) {
            window.location.href = '/setup-account' + window.location.hash
        }
    }, [])

    return (
        <div>
            <header className="fixed top-0 left-0 right-0 z-50">
                <nav
                    data-state={menuState && 'active'}
                    className="group w-full bg-transparent backdrop-blur-sm border-b border-white/10 dark:border-white/5">
                    <div className="m-auto max-w-5xl px-6">
                        <div className="flex flex-wrap items-center justify-between gap-6 py-3 lg:gap-0 lg:py-4">
                            <div className="flex w-full justify-between lg:w-auto">
                                <Link
                                    href="/"
                                    aria-label="home"
                                    className="flex items-center space-x-2">
                                    <Logo />
                                </Link>

                                <button
                                    onClick={() => setMenuState(!menuState)}
                                    aria-label={menuState == true ? 'Close Menu' : 'Open Menu'}
                                    className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden">
                                    <Menu className="group-data-[state=active]:rotate-180 group-data-[state=active]:scale-0 group-data-[state=active]:opacity-0 m-auto size-6 duration-200" />
                                    <X className="group-data-[state=active]:rotate-0 group-data-[state=active]:scale-100 group-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200" />
                                </button>
                            </div>

                            <div className="bg-background group-data-[state=active]:block lg:group-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border p-6 shadow-2xl shadow-zinc-300/20 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none dark:shadow-none dark:lg:bg-transparent">
                                <div className="lg:pr-4">
                                    <ul className="space-y-6 text-base lg:flex lg:gap-8 lg:space-y-0 lg:text-sm">
                                        {menuItems.map((item, index) => (
                                            <li key={index}>
                                                <Link
                                                    href={item.href}
                                                    className="text-muted-foreground hover:text-accent-foreground block duration-150">
                                                    <span>{item.name}</span>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="flex w-full flex-col space-y-3 sm:flex-row sm:gap-3 sm:space-y-0 md:w-fit lg:border-l lg:pl-6">
                                    <Link href="/login" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                                        <span>Login</span>
                                    </Link>
                                    <Link href="/register" className={buttonVariants({ size: 'sm' })}>
                                        <span>Sign Up</span>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </nav>
            </header>

            <main>
                <div
                    aria-hidden
                    className="z-[2] absolute inset-0 pointer-events-none isolate opacity-50 contain-strict hidden lg:block">
                    <div className="w-[35rem] h-[80rem] -translate-y-87.5 absolute left-0 top-0 -rotate-45 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,hsla(0,0%,85%,.08)_0,hsla(0,0%,55%,.02)_50%,hsla(0,0%,45%,0)_80%)]" />
                    <div className="h-[80rem] absolute left-0 top-0 w-56 -rotate-45 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.06)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)] [translate:5%_-50%]" />
                    <div className="h-[80rem] -translate-y-87.5 absolute left-0 top-0 w-56 -rotate-45 bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.04)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)]" />
                </div>

                <section className="relative overflow-hidden bg-white dark:bg-transparent min-h-screen flex items-center justify-center">
                    <div className="absolute inset-0 z-0">
                        <ShadowOverlay
                            sizing="cover"
                            color="rgba(128, 128, 128, 1)"
                            animation={{ scale: 30, speed: 80 }}
                            noise={{ opacity: 0.2, scale: 1 }}
                        />
                    </div>
                    <div className="relative z-10 mx-auto max-w-5xl px-6 py-28 lg:py-24">
                        <div className="mx-auto max-w-2xl text-center">
                            <h1 className="text-balance text-4xl font-semibold md:text-5xl lg:text-6xl text-zinc-900 dark:text-zinc-100">The All-In-One ERP for Modern F&B</h1>
                            <p className="mx-auto my-8 max-w-2xl text-xl text-zinc-700 dark:text-zinc-300">Streamline operations from smart invoice capture to real-time inventory and POS integration. Double-entry accounting made simple.</p>

                            <Link href="/register" className={buttonVariants({ size: 'lg' })}>
                                <span className="btn-label">Start Free Trial</span>
                            </Link>
                        </div>
                    </div>
                </section>

                <section id="solution" className="relative bg-zinc-950 py-32 overflow-hidden">
                    {/* Background glow effects */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-600/10 rounded-full blur-[120px] opacity-50 pointer-events-none" />
                    <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-emerald-600/10 rounded-full blur-[100px] opacity-30 pointer-events-none" />
                    
                    <div className="relative z-10 mx-auto max-w-6xl px-6">
                        <div className="mb-20 text-center max-w-3xl mx-auto">
                            <h2 className="text-3xl font-semibold md:text-5xl text-zinc-100 tracking-tight">Everything you need to run your business</h2>
                            <p className="mt-6 text-xl text-zinc-400">ByteSuite brings your point of sale, back-office accounting, and inventory into one seamless, AI-powered platform.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* AI Invoice OCR */}
                            <div className="group relative overflow-hidden rounded-3xl bg-zinc-900/50 backdrop-blur-md border border-white/5 p-8 hover:bg-zinc-900/80 transition-all duration-500 hover:border-indigo-500/30">
                                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                <div className="relative z-10">
                                    <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/30">
                                        <BrainCircuit className="h-6 w-6" />
                                    </div>
                                    <h3 className="text-2xl font-semibold text-zinc-100 mb-3">AI Invoice Extraction</h3>
                                    <p className="text-zinc-400 leading-relaxed mb-6">
                                        Snap a photo of your supplier invoices. Our GPT-4o vision integration automatically extracts line items, matches them to your catalog, and creates accounts payable entries.
                                    </p>
                                    <Link href="/register" className="inline-flex items-center text-indigo-400 font-medium hover:text-indigo-300 transition-colors">
                                        Learn more <ArrowRight className="ml-2 h-4 w-4" />
                                    </Link>
                                </div>
                            </div>

                            {/* Double-Entry Accounting */}
                            <div className="group relative overflow-hidden rounded-3xl bg-zinc-900/50 backdrop-blur-md border border-white/5 p-8 hover:bg-zinc-900/80 transition-all duration-500 hover:border-emerald-500/30">
                                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                <div className="relative z-10">
                                    <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30">
                                        <Calculator className="h-6 w-6" />
                                    </div>
                                    <h3 className="text-2xl font-semibold text-zinc-100 mb-3">Automated Ledger</h3>
                                    <p className="text-zinc-400 leading-relaxed mb-6">
                                        Real double-entry accounting under the hood. Every POS sale, inventory purchase, and waste log automatically generates precise journal entries mapping to your Chart of Accounts.
                                    </p>
                                    <Link href="/register" className="inline-flex items-center text-emerald-400 font-medium hover:text-emerald-300 transition-colors">
                                        Learn more <ArrowRight className="ml-2 h-4 w-4" />
                                    </Link>
                                </div>
                            </div>

                            {/* Inventory & BOM */}
                            <div className="group relative overflow-hidden rounded-3xl bg-zinc-900/50 backdrop-blur-md border border-white/5 p-8 hover:bg-zinc-900/80 transition-all duration-500 hover:border-amber-500/30 md:col-span-2 lg:col-span-1">
                                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                <div className="relative z-10">
                                    <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30">
                                        <Package className="h-6 w-6" />
                                    </div>
                                    <h3 className="text-2xl font-semibold text-zinc-100 mb-3">Smart Inventory & BOM</h3>
                                    <p className="text-zinc-400 leading-relaxed mb-6">
                                        Manage complex recipes and raw materials. Track exact food costs dynamically based on moving average purchasing prices. Stock is instantly deducted via the POS.
                                    </p>
                                    <Link href="/register" className="inline-flex items-center text-amber-400 font-medium hover:text-amber-300 transition-colors">
                                        Learn more <ArrowRight className="ml-2 h-4 w-4" />
                                    </Link>
                                </div>
                            </div>

                            {/* Point of Sale */}
                            <div className="group relative overflow-hidden rounded-3xl bg-zinc-900/50 backdrop-blur-md border border-white/5 p-8 hover:bg-zinc-900/80 transition-all duration-500 hover:border-cyan-500/30 md:col-span-2 lg:col-span-1">
                                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                <div className="relative z-10">
                                    <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 ring-1 ring-cyan-500/30">
                                        <CreditCard className="h-6 w-6" />
                                    </div>
                                    <h3 className="text-2xl font-semibold text-zinc-100 mb-3">Integrated POS</h3>
                                    <p className="text-zinc-400 leading-relaxed mb-6">
                                        A fast, reliable Point of Sale designed for retail and F&B. Complete transactions seamlessly and watch your cloud inventory, shift reports, and general ledger update in real-time.
                                    </p>
                                    <Link href="/register" className="inline-flex items-center text-cyan-400 font-medium hover:text-cyan-300 transition-colors">
                                        Learn more <ArrowRight className="ml-2 h-4 w-4" />
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    )
}

export const Logo = ({ className }: { className?: string }) => {
    return (
        <div className={cn("flex items-center gap-2", className)}>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 dark:bg-white">
                <Zap className="h-4 w-4 text-white dark:text-zinc-900" />
            </div>
            <span className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">ByteSuite</span>
        </div>
    )
}
