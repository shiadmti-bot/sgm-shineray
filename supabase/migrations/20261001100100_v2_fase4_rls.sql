-- =====================================================================================
-- SGM V2 — Fase 4: segurança no banco (RLS)
-- -------------------------------------------------------------------------------------
-- Liga o Row Level Security nas tabelas da V1 e valida no banco cada mudança de etapa
-- da moto conforme as permissões do perfil de quem executa.
--
-- Aplique SOMENTE depois de:
--   1. fase 1 (estrutura) aplicada;
--   2. fase 2 (scripts/migrar-usuarios-auth.mjs --aplicar) concluída;
--   3. fase 3: V2 do aplicativo publicada e testada.
-- A partir daqui a V1 deixa de funcionar (ela acessa o banco com a chave pública, sem login).
-- Idempotente. Reversão de emergência: docs/implantacao-v2.md.
-- =====================================================================================

begin;

-- -------------------------------------------------------------------------------------
-- 1. funcionarios: leitura para quem tem cadastro ativo, sem a coluna de senha.
--    Escrita somente pelo servidor (rotas /api/admin/* com a service role).
-- -------------------------------------------------------------------------------------
alter table public.funcionarios enable row level security;

do $$
declare v_colunas text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_colunas
    from information_schema.columns
   where table_schema = 'public' and table_name = 'funcionarios' and column_name <> 'senha';
  execute 'revoke all on public.funcionarios from anon, authenticated';
  execute format('grant select (%s) on public.funcionarios to authenticated', v_colunas);
end $$;

drop policy if exists funcionarios_leitura on public.funcionarios;
create policy funcionarios_leitura on public.funcionarios for select to authenticated
  using ((select privado.eh_funcionario_ativo()));

-- -------------------------------------------------------------------------------------
-- 2. motos
-- -------------------------------------------------------------------------------------
alter table public.motos enable row level security;

drop policy if exists motos_leitura on public.motos;
create policy motos_leitura on public.motos for select to authenticated
  using ((select privado.eh_funcionario_ativo()));

drop policy if exists motos_entrada on public.motos;
create policy motos_entrada on public.motos for insert to authenticated
  with check ((select privado.tem_permissao('scanner.registrar')) and status = 'aguardando_montagem'
              and montador_id is null and supervisor_id is null);

drop policy if exists motos_atualizacao on public.motos;
create policy motos_atualizacao on public.motos for update to authenticated
  using ((select privado.tem_alguma_permissao(array[
    'montagem.executar', 'pausas.aprovar', 'qualidade.inspecionar', 'avarias.reparar',
    'etiquetas.imprimir', 'estoque.editar', 'estoque.expedir'])))
  with check (true); -- a etapa de destino é validada pelo gatilho privado.validar_moto()

drop policy if exists motos_remocao on public.motos;
create policy motos_remocao on public.motos for delete to authenticated
  using (status = 'aguardando_montagem' and (select privado.tem_permissao('montagem.remover')));

revoke all on public.motos from anon;

-- Quem pode levar a moto de uma etapa para outra + horários definidos pelo servidor
create or replace function privado.validar_moto()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_eu          uuid := privado.funcionario_id();
  v_de          text := old.status;
  v_para        text := new.status;
  v_ok          boolean := false;
  v_inicio_pausa timestamptz;
  -- Campos que o montador pode ajustar enquanto monta (sem mudar de etapa)
  v_livres      text[] := array['cor', 'cor_banco', 'observacoes', 'localizacao', 'updated_at'];
begin
  -- 1. Horários de montagem pelo relógio do servidor (vale para todos, inclusive Master)
  if v_de is distinct from v_para then
    if v_de = 'aguardando_montagem' and v_para = 'em_producao' then
      new.inicio_montagem := now();
      new.fim_montagem := null;
    elsif v_de = 'em_producao' and v_para = 'em_analise' then
      new.fim_montagem := now();
    elsif v_de = 'pausado' and v_para = 'em_producao' then
      -- O tempo parado não conta como tempo de montagem: o início avança na mesma medida
      select max(p.inicio) into v_inicio_pausa
        from public.pausas_producao p where p.moto_id = new.id and p.fim is null;
      v_inicio_pausa := coalesce(v_inicio_pausa, old.updated_at);
      if old.inicio_montagem is not null and v_inicio_pausa is not null then
        new.inicio_montagem := least(now(), old.inicio_montagem + greatest(now() - v_inicio_pausa, interval '0'));
      end if;
      update public.pausas_producao set fim = now() where moto_id = new.id and fim is null;
    end if;
  end if;

  -- 2. Servidor (service role), SQL Editor e perfil Master não passam pelas regras abaixo
  if auth.uid() is null or privado.eh_master() then
    return new;
  end if;
  if v_eu is null then
    raise exception 'Usuário sem cadastro ativo no SGM' using errcode = '42501';
  end if;
  if new.sku is distinct from old.sku or new.created_at is distinct from old.created_at then
    raise exception 'O chassi e a data de entrada de uma moto não podem ser alterados' using errcode = '42501';
  end if;
  -- Responsáveis só podem ser gravados como o próprio usuário (trilha de auditoria confiável)
  if new.montador_id is distinct from old.montador_id and new.montador_id is distinct from v_eu then
    raise exception 'O montador só pode assumir a moto para si mesmo' using errcode = '42501';
  end if;
  if new.supervisor_id is distinct from old.supervisor_id and new.supervisor_id is distinct from v_eu then
    raise exception 'A inspeção só pode ser registrada em nome do próprio usuário' using errcode = '42501';
  end if;
  -- Contador de retrabalho: só a Qualidade soma, e de um em um
  if new.rework_count is distinct from old.rework_count
     and not (v_de = 'em_analise' and v_para = 'retrabalho_montagem'
              and new.rework_count = coalesce(old.rework_count, 0) + 1) then
    raise exception 'O contador de retrabalho não pode ser alterado manualmente' using errcode = '42501';
  end if;

  if v_de is not distinct from v_para then
    v_ok := privado.tem_permissao('estoque.editar')
            or (v_de = 'em_producao' and old.montador_id = v_eu and privado.tem_permissao('montagem.executar')
                and (to_jsonb(new) - v_livres) = (to_jsonb(old) - v_livres));
  elsif v_de = 'aguardando_montagem' and v_para = 'em_producao' then
    v_ok := privado.tem_permissao('montagem.executar') and new.montador_id = v_eu;
  elsif v_de = 'retrabalho_montagem' and v_para = 'em_producao' then
    -- O retrabalho volta para quem montou; se essa pessoa não está mais ativa, qualquer montador assume
    v_ok := privado.tem_permissao('montagem.executar') and new.montador_id = v_eu
            and (old.montador_id = v_eu or privado.tem_permissao('pausas.aprovar')
                 or not exists (select 1 from public.funcionarios f where f.id = old.montador_id and f.ativo is true));
  elsif v_de = 'pausado' and v_para = 'em_producao' then
    v_ok := privado.tem_permissao('montagem.executar')
            and (old.montador_id = v_eu or privado.tem_permissao('pausas.aprovar'));
  elsif v_de = 'em_producao' and v_para = 'em_analise' then
    v_ok := privado.tem_permissao('montagem.executar')
            and (old.montador_id = v_eu or privado.tem_permissao('pausas.aprovar'));
  elsif v_de = 'em_producao' and v_para = 'pausado' then
    v_ok := privado.tem_permissao('pausas.aprovar');
  elsif v_de = 'em_analise' and (v_para in ('aguardando_etiqueta', 'retrabalho_montagem') or v_para like 'avaria\_%') then
    v_ok := privado.tem_permissao('qualidade.inspecionar');
  elsif v_de like 'avaria\_%' and v_para = 'em_analise' then
    v_ok := privado.tem_permissao('avarias.reparar');
  elsif v_de = 'aguardando_etiqueta' and v_para = 'estoque' then
    v_ok := privado.tem_permissao('etiquetas.imprimir');
  elsif v_de = 'estoque' and v_para = 'aguardando_etiqueta' then
    v_ok := privado.tem_permissao('estoque.editar');
  elsif v_de = 'estoque' and v_para = 'expedido' then
    v_ok := privado.tem_permissao('estoque.expedir');
  end if;

  if not v_ok then
    raise exception 'Operação não permitida para o seu perfil (% → %)', coalesce(v_de, '-'), coalesce(v_para, '-')
      using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function privado.validar_moto() from public;

drop trigger if exists validar_moto on public.motos;
create trigger validar_moto before update on public.motos
  for each row execute function privado.validar_moto();

-- -------------------------------------------------------------------------------------
-- 3. Pausas
-- -------------------------------------------------------------------------------------
alter table public.solicitacoes_pausa enable row level security;

drop policy if exists solicitacoes_leitura on public.solicitacoes_pausa;
create policy solicitacoes_leitura on public.solicitacoes_pausa for select to authenticated
  using (montador_id = (select privado.funcionario_id())
         or (select privado.tem_alguma_permissao(array['pausas.aprovar', 'relatorios.ver'])));
drop policy if exists solicitacoes_criacao on public.solicitacoes_pausa;
create policy solicitacoes_criacao on public.solicitacoes_pausa for insert to authenticated
  with check ((select privado.tem_permissao('montagem.executar'))
              and montador_id = (select privado.funcionario_id()) and status = 'pendente');
drop policy if exists solicitacoes_decisao on public.solicitacoes_pausa;
create policy solicitacoes_decisao on public.solicitacoes_pausa for update to authenticated
  using ((select privado.tem_permissao('pausas.aprovar')))
  with check (supervisor_id is not distinct from (select privado.funcionario_id()));
drop policy if exists solicitacoes_cancelamento on public.solicitacoes_pausa;
create policy solicitacoes_cancelamento on public.solicitacoes_pausa for delete to authenticated
  using (montador_id = (select privado.funcionario_id()) and status = 'pendente');
revoke all on public.solicitacoes_pausa from anon;

alter table public.pausas_producao enable row level security;

drop policy if exists pausas_leitura on public.pausas_producao;
create policy pausas_leitura on public.pausas_producao for select to authenticated
  using ((select privado.eh_funcionario_ativo()));
drop policy if exists pausas_criacao on public.pausas_producao;
create policy pausas_criacao on public.pausas_producao for insert to authenticated
  with check ((select privado.tem_permissao('pausas.aprovar')));
drop policy if exists pausas_encerramento on public.pausas_producao;
create policy pausas_encerramento on public.pausas_producao for update to authenticated
  using (montador_id = (select privado.funcionario_id()) or (select privado.tem_permissao('pausas.aprovar')));
revoke all on public.pausas_producao from anon;

-- -------------------------------------------------------------------------------------
-- 4. Histórico de avarias
-- -------------------------------------------------------------------------------------
alter table public.historico_avarias enable row level security;

drop policy if exists avarias_leitura on public.historico_avarias;
create policy avarias_leitura on public.historico_avarias for select to authenticated
  using ((select privado.eh_funcionario_ativo()));
drop policy if exists avarias_registro on public.historico_avarias;
create policy avarias_registro on public.historico_avarias for insert to authenticated
  with check ((select privado.tem_permissao('qualidade.inspecionar'))
              and supervisor_id is not distinct from (select privado.funcionario_id()));
drop policy if exists avarias_reparo on public.historico_avarias;
create policy avarias_reparo on public.historico_avarias for update to authenticated
  using ((select privado.tem_permissao('avarias.reparar')));
revoke all on public.historico_avarias from anon;

-- -------------------------------------------------------------------------------------
-- 5. Auditoria (somente inserção pelo app; leitura por permissão; nunca alteração)
-- -------------------------------------------------------------------------------------
alter table public.logs_sistema enable row level security;

drop policy if exists logs_leitura on public.logs_sistema;
create policy logs_leitura on public.logs_sistema for select to authenticated
  using ((select privado.tem_permissao('auditoria.ver'))
         -- Painel, prontuário e relatórios enxergam só os eventos operacionais (nada de acessos)
         or ((select privado.tem_alguma_permissao(array['painel.ver', 'prontuario.ver', 'relatorios.ver']))
             and referencia is distinct from 'Sistema'
             and acao not in ('LOGIN', 'LOGIN_FALHA', 'LOGOUT', 'SENHA_ALTERADA', 'CONFIGURACAO')));
drop policy if exists logs_registro on public.logs_sistema;
create policy logs_registro on public.logs_sistema for insert to authenticated
  with check ((select privado.eh_funcionario_ativo()));
revoke all on public.logs_sistema from anon;
revoke update, delete, truncate on public.logs_sistema from authenticated;

-- -------------------------------------------------------------------------------------
-- 6. Configurações (substitui as políticas abertas da migração 20260928120000)
-- -------------------------------------------------------------------------------------
create table if not exists public.configuracoes_sistema (
  chave text primary key, valor jsonb not null, atualizado_por text, updated_at timestamptz not null default now()
);
alter table public.configuracoes_sistema enable row level security;
drop policy if exists configuracoes_leitura on public.configuracoes_sistema;
drop policy if exists configuracoes_insercao on public.configuracoes_sistema;
drop policy if exists configuracoes_atualizacao on public.configuracoes_sistema;

create policy configuracoes_leitura on public.configuracoes_sistema for select to authenticated
  using ((select privado.eh_funcionario_ativo()));
create policy configuracoes_insercao on public.configuracoes_sistema for insert to authenticated
  with check ((chave = 'etiquetas' and (select privado.tem_permissao('etiquetas.layout')))
              or (chave <> 'etiquetas' and (select privado.tem_permissao('configuracoes.gerenciar'))));
create policy configuracoes_atualizacao on public.configuracoes_sistema for update to authenticated
  using ((chave = 'etiquetas' and (select privado.tem_permissao('etiquetas.layout')))
         or (chave <> 'etiquetas' and (select privado.tem_permissao('configuracoes.gerenciar'))))
  with check ((chave = 'etiquetas' and (select privado.tem_permissao('etiquetas.layout')))
              or (chave <> 'etiquetas' and (select privado.tem_permissao('configuracoes.gerenciar'))));
revoke all on public.configuracoes_sistema from anon;

-- TRUNCATE não passa pelo RLS: ninguém além do dono das tabelas pode usar
revoke truncate on all tables in schema public from anon, authenticated;

-- -------------------------------------------------------------------------------------
-- 7. Conferência: tabelas do schema public que ficaram sem RLS
-- -------------------------------------------------------------------------------------
do $$
declare v_abertas text;
begin
  select string_agg(tablename, ', ') into v_abertas
    from pg_tables where schemaname = 'public' and not rowsecurity;
  if v_abertas is not null then
    raise notice 'ATENÇÃO: tabelas sem RLS (acessíveis pela chave pública): %', v_abertas;
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
