-- SGM Shineray: configurações compartilhadas entre todas as estações
-- (layout das etiquetas, meta diária, limites de alerta, checklist, catálogos de cores/modelos).
--
-- Como aplicar: Supabase > SQL Editor > colar e executar (ou `supabase db push`).
-- Enquanto esta tabela não existir, o SGM funciona normalmente, mas salva essas
-- configurações apenas no navegador de cada dispositivo.

create table if not exists public.configuracoes_sistema (
  chave          text primary key,
  valor          jsonb not null,
  atualizado_por text,
  updated_at     timestamptz not null default now()
);

comment on table public.configuracoes_sistema is
  'Configurações globais do SGM (chave/valor JSON): etiquetas, metas, checklist e catálogos.';

alter table public.configuracoes_sistema enable row level security;

-- O front-end do SGM acessa o banco com a chave anon (mais a sessão "sombra" do Supabase Auth).
-- As políticas seguem esse modelo atual. Ao migrar o login para o Supabase Auth com o cargo
-- no JWT, restrinja INSERT/UPDATE a gestor/master.
drop policy if exists configuracoes_leitura on public.configuracoes_sistema;
create policy configuracoes_leitura on public.configuracoes_sistema
  for select to anon, authenticated using (true);

drop policy if exists configuracoes_insercao on public.configuracoes_sistema;
create policy configuracoes_insercao on public.configuracoes_sistema
  for insert to anon, authenticated with check (true);

drop policy if exists configuracoes_atualizacao on public.configuracoes_sistema;
create policy configuracoes_atualizacao on public.configuracoes_sistema
  for update to anon, authenticated using (true) with check (true);

grant select, insert, update on public.configuracoes_sistema to anon, authenticated;

-- Faz a API (PostgREST) enxergar a nova tabela imediatamente.
notify pgrst, 'reload schema';
