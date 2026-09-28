import withPWAInit from "@ducanh2912/next-pwa";

// Endereço do Supabase: as respostas dele NUNCA vão para o cache do aplicativo (dados de
// outros usuários ou desatualizados poderiam aparecer em tablets compartilhados).
const origemSupabase = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").origin;
  } catch {
    return null;
  }
})();
const escaparRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  swcMinify: true,
  disable: process.env.NODE_ENV === "development",
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      // Rotas /api do próprio sistema (administração de usuários): sempre direto no servidor
      {
        urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/"),
        handler: "NetworkOnly",
        method: "GET",
        options: { cacheName: "apis" },
      },
      ...(origemSupabase
        ? [{ urlPattern: new RegExp(`^${escaparRegex(origemSupabase)}/`), handler: "NetworkOnly", options: { cacheName: "supabase" } }]
        : []),
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    // A antiga "Gestão de Equipe" agora é /equipe
    return [{ source: "/tecnicos", destination: "/equipe", permanent: true }];
  },
};

export default withPWA(nextConfig);
