import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SGM Shineray',
    short_name: 'SGM',
    description: 'Sistema de Gestão de Montagem e Qualidade',
    start_url: '/login', // Ao abrir o app, vai direto pro login
    display: 'standalone', // Remove a barra do navegador (fio app nativo)
    background_color: '#ffffff',
    theme_color: '#2563eb', // Azul da Shineray
    icons: [
      {
        src: '/web-app-manifest-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/web-app-manifest-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}