import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const URL = "https://lazotanpizqelcaypxov.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxhem90YW5waXpxZWxjYXlweG92Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMTYzODIsImV4cCI6MjA4NDU5MjM4Mn0.hHtNsMCA_WZnTOV_dmLfbwCWik3MGeFifcF-xDONUKw";

const supabase = createClient(URL, ANON_KEY);

const tabelas = [
  "funcionarios",
  "motos",
  "solicitacoes_pausa",
  "pausas_producao",
  "historico_avarias",
  "catalogo_produtos",
  "logs_sistema",
];

async function exportar() {
  const dir = path.resolve("backups/pre-v2-2026-09-29");
  await fs.mkdir(dir, { recursive: true });
  console.log(`Iniciando backup para ${dir}...`);

  for (const tabela of tabelas) {
    let todos = [];
    let inicio = 0;
    const passo = 1000;

    while (true) {
      const { data, error } = await supabase
        .from(tabela)
        .select("*")
        .range(inicio, inicio + passo - 1);

      if (error) {
        console.error(`Erro ao ler ${tabela}:`, error.message);
        break;
      }

      todos.push(...data);
      if (data.length < passo) break;
      inicio += passo;
    }

    const destino = path.join(dir, `${tabela}.json`);
    await fs.writeFile(destino, JSON.stringify(todos, null, 2), "utf8");
    console.log(`Tabela ${tabela}: ${todos.length} registros salvos.`);
  }

  console.log("Backup concluído com sucesso!");
}

exportar().catch(console.error);
