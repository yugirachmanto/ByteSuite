export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="ByteSuite">
      <rect width="512" height="512" rx="112" fill="#4f46e5" />
      <path
        fill="#fff"
        fillRule="evenodd"
        d="M150 120H298C352 120 364 156 364 188C364 220 344 244 316 254C352 262 376 288 376 324C376 366 348 392 298 392H150ZM214 176V220H292C308 220 314 210 314 198C314 186 308 176 292 176ZM214 290V338H296C314 338 322 328 322 314C322 300 314 290 296 290Z"
      />
    </svg>
  )
}
