import { tokenDeAcesso } from "./auth";

/** Chama as rotas /api do próprio sistema com o token da sessão atual. Lança Error com a mensagem do servidor. */
export async function chamarApi<T>(caminho: string, opcoes: { metodo?: string; corpo?: unknown } = {}): Promise<T> {
  const token = await tokenDeAcesso();
  if (!token) throw new Error("Sessão expirada. Entre novamente.");
  let resposta: Response;
  try {
    resposta = await fetch(caminho, {
      method: opcoes.metodo ?? "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
      cache: "no-store",
    });
  } catch {
    throw new Error("Sem conexão com o servidor.");
  }
  const json = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error((json as { erro?: string }).erro || `Erro ${resposta.status}`);
  return json as T;
}
