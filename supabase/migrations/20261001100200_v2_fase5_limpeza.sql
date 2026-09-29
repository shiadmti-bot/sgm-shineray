-- =====================================================================================
-- SGM V2 — Fase 5: limpeza
-- -------------------------------------------------------------------------------------
-- Remove as senhas em texto puro da V1 e o acesso residual da chave pública.
-- Aplique depois que TODOS os usuários já tiverem entrado na V2 com sucesso
-- (a fase 2 copiou as senhas para o Supabase Auth, que guarda apenas o hash).
-- Esta fase não tem volta: faça um backup antes (Database > Backups).
-- =====================================================================================

begin;

alter table public.funcionarios drop column if exists senha;
-- Sem a coluna de senha, a leitura volta a ser por tabela (colunas novas já ficam visíveis)
grant select on public.funcionarios to authenticated;

-- A V2 nunca usa a chave pública para ler ou gravar tabelas (só para o login).
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

commit;

notify pgrst, 'reload schema';
