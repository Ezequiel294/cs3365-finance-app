import type { MetadataRoute } from 'next';

/** Web app manifest so the UI can be installed as a PWA. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Finance App',
    short_name: 'Finance',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f6f7f9',
    theme_color: '#12263f',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
