export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/mark.png" alt="ByteSuite" className={`${className} object-contain`} />
}
