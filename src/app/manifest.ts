import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SGM Shineray',
    short_name: 'SGM',
    description: 'Sistema de Gestão de Montagem e Qualidade',
    start_url: '/',
    display: 'standalone', // sem a barra do navegador
    background_color: '#ffffff',
    theme_color: '#dc2626',
    orientation: 'any', // tablets da linha ficam em paisagem ou retrato
    icons: [
      {
        src: '/icon-192.png', // Caminho na pasta public
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: '/icon-512.png', // Caminho na pasta public
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      },
    ],
  };
}