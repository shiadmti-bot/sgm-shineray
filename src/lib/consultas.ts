// O Supabase devolve no máximo 1.000 linhas por consulta (limite padrão da API).
// Para relatórios e indicadores, busca em páginas até trazer tudo.

const TAMANHO_PAGINA = 1000;

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** `montar(de, ate)` deve devolver a consulta já filtrada e ORDENADA com `.range(de, ate)`. */
export async function buscarTodas<T>(montar: (de: number, ate: number) => Pagina<T>, limite = 50_000): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; de < limite; de += TAMANHO_PAGINA) {
    const { data, error } = await montar(de, de + TAMANHO_PAGINA - 1);
    if (error) throw new Error(error.message);
    todas.push(...(data ?? []));
    if (!data || data.length < TAMANHO_PAGINA) break;
  }
  return todas;
}
