import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SGM Shineray',
    short_name: 'SGM',
    description: 'Sistema de Gestão de Montagem e Qualidade',
    start_url: '/', // Mudei para raiz '/' para evitar erros de redirecionamento
    display: 'standalone', // ISSO é o que tira a barra de navegação
    background_color: '#ffffff',
    theme_color: '#2563eb',
    orientation: 'portrait', // Força modo retrato no celular
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