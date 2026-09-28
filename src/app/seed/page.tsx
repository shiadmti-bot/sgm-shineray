import { notFound } from "next/navigation";
import SeedClient from "./SeedClient";

// Ferramenta de desenvolvimento que APAGA o banco inteiro e recria usuários com senhas padrão.
// Fica indisponível (404) a menos que SGM_HABILITAR_SEED=true esteja definido no servidor.
// Nunca habilite essa variável no ambiente de produção.
export const dynamic = "force-dynamic";

export default function SeedPage() {
  if (process.env.SGM_HABILITAR_SEED !== "true") notFound();
  return <SeedClient />;
}
