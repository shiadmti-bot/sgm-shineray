import { supabase } from "./supabase";
import { registrarLog } from "./logger";
import { encerrarSessao, getUsuarioLogado } from "./auth";

export type MotivoLogout = "manual" | "inativo";

/** Encerra a sessão local, registra o evento na auditoria e desconecta o Supabase Auth deste dispositivo. */
export async function efetuarLogout(motivo: MotivoLogout = "manual") {
  if (getUsuarioLogado()) {
    await registrarLog("LOGOUT", "Sistema", { motivo });
  }
  encerrarSessao();
  try {
    // scope "local": não derruba a sessão do mesmo usuário em outros dispositivos.
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Sem sessão Auth ativa: nada a fazer.
  }
}
