import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SGM Shineray',
    short_name: 'SGM By Sabel',
    description: 'Sistema de Gestão de Montagem e Qualidade',
    start_url: '/login',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2563eb',
  };
}