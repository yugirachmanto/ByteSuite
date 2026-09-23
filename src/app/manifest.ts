import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ByteSuite',
    short_name: 'ByteSuite',
    description: 'ERP for Restaurant and Café management',
    start_url: '/pos',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#09090b',
    theme_color: '#09090b',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
