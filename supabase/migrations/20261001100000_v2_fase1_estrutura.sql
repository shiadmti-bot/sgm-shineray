-- =====================================================================================
-- SGM V2 — Fase 1: estrutura
-- -------------------------------------------------------------------------------------
-- Cria perfis de acesso (RBAC), funções de permissão, notificações, fotos, inventário,
-- RPCs e gatilhos. NÃO liga o RLS nas tabelas já existentes: a V1 continua funcionando
-- normalmente depois desta fase. Pode ser executada mais de uma vez (idempotente).
--
-- Ordem de implantação completa: docs/implantacao-v2.md
-- =====================================================================================

begin;

-- -------------------------------------------------------------------------------------
-- Conferência do esquema da V1: interrompe com uma mensagem clara se o banco for diferente
-- do esperado (nada é gravado, a transação inteira é desfeita).
-- -------------------------------------------------------------------------------------
do $$
declare
  v_faltando text;
  v_tipo text;
  r record;
begin
  select string_agg(format('%s.%s', t.tabela, t.coluna), ', ') into v_faltando
    from (values
      ('funcionarios', 'id'), ('funcionarios', 'nome'), ('funcionarios', 'cargo'), ('funcionarios', 'matricula'),
      ('funcionarios', 'email'), ('funcionarios', 'ativo'),
      ('motos', 'id'), ('motos', 'sku'), ('motos', 'modelo'), ('motos', 'status'), ('motos', 'montador_id'),
      ('motos', 'supervisor_id'), ('motos', 'inicio_montagem'), ('motos', 'fim_montagem'), ('motos', 'updated_at'),
      ('motos', 'created_at'), ('motos', 'rework_count'), ('motos', 'observacoes'), ('motos', 'detalhes_avaria'),
      ('motos', 'tecnico_reparo'), ('motos', 'localizacao'),
      ('solicitacoes_pausa', 'id'), ('solicitacoes_pausa', 'montador_id'), ('solicitacoes_pausa', 'moto_id'),
      ('solicitacoes_pausa', 'motivo'), ('solicitacoes_pausa', 'status'), ('solicitacoes_pausa', 'supervisor_id'),
      ('pausas_producao', 'id'), ('pausas_producao', 'moto_id'), ('pausas_producao', 'montador_id'), ('pausas_producao', 'inicio'),
      ('historico_avarias', 'id'), ('historico_avarias', 'moto_id'), ('historico_avarias', 'supervisor_id'),
      ('logs_sistema', 'id'), ('logs_sistema', 'acao'), ('logs_sistema', 'usuario'), ('logs_sistema', 'referencia'),
      ('logs_sistema', 'detalhes'), ('logs_sistema', 'created_at')
    ) as t(tabela, coluna)
   where not exists (select 1 from information_schema.columns c
                      where c.table_schema = 'public' and c.table_name = t.tabela and c.column_name = t.coluna);
  if v_faltando is not null then
    raise exception 'Esquema diferente do esperado. Colunas não encontradas: %', v_faltando;
  end if;

  select data_type into v_tipo from information_schema.columns
   where table_schema = 'public' and table_name = 'funcionarios' and column_name = 'id';
  if v_tipo <> 'uuid' then
    raise exception 'funcionarios.id é do tipo % (esperado: uuid). Fale com o suporte antes de continuar.', v_tipo;
  end if;
  select data_type into v_tipo from information_schema.columns
   where table_schema = 'public' and table_name = 'motos' and column_name = 'id';
  if v_tipo <> 'uuid' then
    raise exception 'motos.id é do tipo % (esperado: uuid). Fale com o suporte antes de continuar.', v_tipo;
  end if;

  -- Colunas de "situação" em ENUM viram texto (a V2 usa etapas e ações novas; a V1 continua funcionando)
  for r in
    select c.table_name, c.column_name from information_schema.columns c
     where c.table_schema = 'public' and c.data_type = 'USER-DEFINED'
       and (c.table_name, c.column_name) in (('logs_sistema', 'acao'), ('motos', 'status'), ('funcionarios', 'cargo'),
                                             ('solicitacoes_pausa', 'status'), ('historico_avarias', 'status_ticket'))
  loop
    execute format('alter table public.%I alter column %I type text using %I::text', r.table_name, r.column_name, r.column_name);
    raise notice 'Coluna %.% convertida de ENUM para texto.', r.table_name, r.column_name;
  end loop;
end $$;

-- -------------------------------------------------------------------------------------
-- 0. Schema interno (não exposto pela API REST)
-- -------------------------------------------------------------------------------------
create schema if not exists privado;
revoke all on schema privado from public;
grant usage on schema privado to authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 1. Catálogo de permissões (a mesma lista existe em src/lib/rbac/permissoes.ts)
-- -------------------------------------------------------------------------------------
create or replace function privado.permissoes_validas()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    'painel.ver', 'prontuario.ver',
    'scanner.registrar', 'montagem.executar', 'montagem.remover', 'pausas.aprovar',
    'qualidade.inspecionar', 'avarias.ver', 'avarias.reparar',
    'etiquetas.imprimir', 'etiquetas.layout',
    'estoque.ver', 'estoque.editar', 'estoque.expedir', 'inventario.executar',
    'relatorios.ver', 'equipe.ver', 'equipe.gerenciar', 'perfis.gerenciar',
    'auditoria.ver', 'configuracoes.gerenciar'
  ]::text[]
$$;

-- -------------------------------------------------------------------------------------
-- 2. Perfis de acesso
-- -------------------------------------------------------------------------------------
create table if not exists public.perfis (
  id           uuid primary key default gen_random_uuid(),
  chave        text not null unique check (chave ~ '^[a-z][a-z0-9_]{1,39}$'),
  nome         text not null,
  descricao    text,
  permissoes   text[] not null default '{}',
  acesso_pin   boolean not null default false,
  tela_inicial text not null default '/dashboard',
  sistema      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.perfis is 'SGM: perfis de acesso (RBAC). O perfil "master" tem acesso total.';
comment on column public.perfis.acesso_pin is 'Login pelo teclado numérico (matrícula + PIN de 4 dígitos).';

insert into public.perfis (chave, nome, descricao, permissoes, acesso_pin, tela_inicial, sistema) values
  ('master', 'Master', 'Acesso total ao sistema, inclusive perfis de acesso.', '{}', false, '/dashboard', true),
  ('gestor', 'Gestor', 'Visão gerencial, estoque, relatórios, equipe, auditoria e configurações.',
    array['painel.ver','prontuario.ver','scanner.registrar','pausas.aprovar','qualidade.inspecionar','avarias.ver',
          'avarias.reparar','etiquetas.imprimir','etiquetas.layout','estoque.ver','estoque.editar','estoque.expedir',
          'inventario.executar','relatorios.ver','equipe.ver','equipe.gerenciar','auditoria.ver','configuracoes.gerenciar'],
    false, '/dashboard', true),
  ('supervisor', 'Supervisor', 'Qualidade, pausas, avarias, etiquetagem e estoque.',
    array['painel.ver','prontuario.ver','scanner.registrar','montagem.executar','montagem.remover','pausas.aprovar',
          'qualidade.inspecionar','avarias.ver','avarias.reparar','etiquetas.imprimir','estoque.ver','estoque.editar',
          'estoque.expedir','inventario.executar'],
    false, '/qualidade', true),
  ('montador', 'Montador', 'Linha de montagem, entrada de caixas e etiquetagem.',
    array['scanner.registrar','montagem.executar','montagem.remover','etiquetas.imprimir'],
    true, '/montagem', true)
on conflict (chave) do nothing;

-- -------------------------------------------------------------------------------------
-- 3. Funcionários: vínculo com o Supabase Auth e com o perfil
-- -------------------------------------------------------------------------------------
alter table public.funcionarios add column if not exists perfil_id    uuid references public.perfis(id);
alter table public.funcionarios add column if not exists auth_user_id uuid;
alter table public.funcionarios add column if not exists login_email  text;
create unique index if not exists funcionarios_auth_user_id_key on public.funcionarios (auth_user_id) where auth_user_id is not null;
create index if not exists funcionarios_login_email_idx on public.funcionarios (lower(login_email));

-- Perfil inicial a partir do cargo da V1 (cargos desconhecidos ficam sem perfil e são listados abaixo)
update public.funcionarios f
   set perfil_id = p.id
  from public.perfis p
 where f.perfil_id is null
   and p.chave = lower(trim(f.cargo::text));

do $$
declare v_sem_perfil text;
begin
  select string_agg(nome || ' (' || coalesce(cargo::text, '?') || ')', ', ') into v_sem_perfil
    from public.funcionarios where perfil_id is null;
  if v_sem_perfil is not null then
    raise notice 'Funcionários sem perfil (defina manualmente na tela Equipe): %', v_sem_perfil;
  end if;
  select string_agg(nome, ', ') into v_sem_perfil from public.funcionarios where ativo is null;
  if v_sem_perfil is not null then
    raise notice 'Funcionários com "ativo" vazio são tratados como INATIVOS na V2: %', v_sem_perfil;
  end if;
end $$;

-- -------------------------------------------------------------------------------------
-- 4. Funções de permissão (usadas pelo RLS e pelas RPCs)
-- -------------------------------------------------------------------------------------
create or replace function privado.funcionario_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select f.id from public.funcionarios f
   where f.auth_user_id = auth.uid() and f.ativo is true
   limit 1
$$;

create or replace function privado.eh_funcionario_ativo()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.funcionarios f where f.auth_user_id = auth.uid() and f.ativo is true)
$$;

create or replace function privado.eh_master()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.funcionarios f join public.perfis p on p.id = f.perfil_id
     where f.auth_user_id = auth.uid() and f.ativo is true and p.chave = 'master'
  )
$$;

create or replace function privado.tem_permissao(p_permissao text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.funcionarios f join public.perfis p on p.id = f.perfil_id
     where f.auth_user_id = auth.uid() and f.ativo is true
       and (p.chave = 'master' or p_permissao = any (p.permissoes))
  )
$$;

create or replace function privado.tem_alguma_permissao(p_permissoes text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.funcionarios f join public.perfis p on p.id = f.perfil_id
     where f.auth_user_id = auth.uid() and f.ativo is true
       and (p.chave = 'master' or p.permissoes && p_permissoes)
  )
$$;

revoke all on all functions in schema privado from public;
grant execute on all functions in schema privado to authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- 5. RPCs expostas ao aplicativo
-- -------------------------------------------------------------------------------------

-- Perfil e permissões do usuário logado
drop function if exists public.meu_perfil();
create or replace function public.meu_perfil()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'funcionario_id', f.id,
    'nome', f.nome,
    'email', f.email,
    'matricula', f.matricula,
    'cargo', f.cargo,
    'master', coalesce(p.chave = 'master', false),
    'permissoes', coalesce(to_jsonb(p.permissoes), '[]'::jsonb),
    'perfil', case when p.id is null then null else jsonb_build_object(
      'id', p.id, 'chave', p.chave, 'nome', p.nome, 'tela_inicial', p.tela_inicial, 'acesso_pin', p.acesso_pin) end
  )
  from public.funcionarios f
  left join public.perfis p on p.id = f.perfil_id
  where f.auth_user_id = auth.uid() and f.ativo is true
  limit 1
$$;
revoke all on function public.meu_perfil() from public, anon;
grant execute on function public.meu_perfil() to authenticated;

-- E-mail de login a partir da matrícula ou do e-mail (tela de login, antes de autenticar).
-- Quem tem matrícula entra com um e-mail técnico (<matricula>@shineray.sys): a consulta por
-- matrícula nunca revela o e-mail real de ninguém.
create or replace function public.email_login(p_identificador text)
returns text language sql stable security definer set search_path = '' as $$
  select f.login_email from public.funcionarios f
   where f.ativo is true and f.login_email is not null
     and length(trim(coalesce(p_identificador, ''))) > 0
     and (f.matricula::text = trim(p_identificador)
          or lower(f.email) = lower(trim(p_identificador))
          or lower(f.login_email) = lower(trim(p_identificador)))
   order by (f.matricula::text = trim(p_identificador)) desc nulls last
   limit 1
$$;
revoke all on function public.email_login(text) from public;
grant execute on function public.email_login(text) to anon, authenticated;

-- Registro de tentativa de login malsucedida (com limite para não inundar a auditoria)
create or replace function public.registrar_falha_login(p_identificador text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.logs_sistema
       where acao = 'LOGIN_FALHA' and created_at > now() - interval '1 minute') >= 30 then
    return;
  end if;
  insert into public.logs_sistema (acao, usuario, referencia, detalhes, created_at)
  values ('LOGIN_FALHA', 'Sistema / Desconhecido', 'Sistema',
          to_jsonb(jsonb_build_object('identificador', left(coalesce(p_identificador, ''), 80))::text), now());
end $$;
revoke all on function public.registrar_falha_login(text) from public;
grant execute on function public.registrar_falha_login(text) to anon, authenticated;

-- -------------------------------------------------------------------------------------
-- 6. Auditoria: autor e horário definidos pelo servidor
-- -------------------------------------------------------------------------------------
alter table public.logs_sistema add column if not exists autor_id uuid references public.funcionarios(id) on delete set null;
create index if not exists logs_sistema_referencia_idx on public.logs_sistema (referencia);
create index if not exists logs_sistema_created_at_idx on public.logs_sistema (created_at desc);

create or replace function privado.preencher_autor_log()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_nome text;
begin
  new.created_at := now();
  if auth.uid() is not null then
    select f.id, f.nome into v_id, v_nome from public.funcionarios f where f.auth_user_id = auth.uid() limit 1;
    if v_id is not null then
      new.autor_id := v_id;
      new.usuario := v_nome;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists preencher_autor_log on public.logs_sistema;
create trigger preencher_autor_log before insert on public.logs_sistema
  for each row execute function privado.preencher_autor_log();

-- -------------------------------------------------------------------------------------
-- 7. Motos: horário de atualização pelo servidor + índices
-- -------------------------------------------------------------------------------------
create or replace function privado.tocar_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists tocar_updated_at on public.motos;
create trigger tocar_updated_at before update on public.motos
  for each row execute function privado.tocar_updated_at();

create index if not exists motos_sku_idx on public.motos (upper(sku));
create index if not exists motos_status_idx on public.motos (status);
create index if not exists pausas_producao_moto_idx on public.pausas_producao (moto_id);
create index if not exists historico_avarias_moto_idx on public.historico_avarias (moto_id);
create index if not exists solicitacoes_pausa_status_idx on public.solicitacoes_pausa (status);

-- Chassi único (só cria se não houver duplicados hoje)
do $$
begin
  if exists (select 1 from public.motos group by upper(sku) having count(*) > 1) then
    raise notice 'Há chassis duplicados em motos: o índice único não foi criado. Corrija e rode esta fase novamente.';
  else
    create unique index if not exists motos_sku_unico on public.motos (upper(sku));
  end if;
end $$;

-- Pausas: registro do fim (duração real do tempo parado)
alter table public.pausas_producao add column if not exists fim timestamptz;

-- -------------------------------------------------------------------------------------
-- 8. Notificações
-- -------------------------------------------------------------------------------------
create table if not exists public.notificacoes (
  id             uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  tipo           text not null default 'info',
  titulo         text not null,
  mensagem       text,
  link           text,
  dados          jsonb,
  lida_em        timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists notificacoes_destino_idx on public.notificacoes (funcionario_id, created_at desc);

create or replace function privado.notificar_permissao(
  p_permissao text, p_tipo text, p_titulo text, p_mensagem text, p_link text, p_dados jsonb default null, p_exceto uuid default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notificacoes (funcionario_id, tipo, titulo, mensagem, link, dados)
  select f.id, p_tipo, p_titulo, p_mensagem, p_link, p_dados
    from public.funcionarios f join public.perfis p on p.id = f.perfil_id
   where f.ativo is true and p_permissao = any (p.permissoes)
     and (p_exceto is null or f.id <> p_exceto)
$$;

create or replace function privado.notificar_funcionario(
  p_funcionario uuid, p_tipo text, p_titulo text, p_mensagem text, p_link text, p_dados jsonb default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notificacoes (funcionario_id, tipo, titulo, mensagem, link, dados)
  select f.id, p_tipo, p_titulo, p_mensagem, p_link, p_dados
    from public.funcionarios f where f.id = p_funcionario and f.ativo is true
$$;

-- Eventos de pausa
create or replace function privado.notificar_solicitacao_pausa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_nome text; v_modelo text; v_sku text;
begin
  select nome into v_nome from public.funcionarios where id = new.montador_id;
  select modelo, sku into v_modelo, v_sku from public.motos where id = new.moto_id;
  if tg_op = 'INSERT' and new.status = 'pendente' then
    perform privado.notificar_permissao('pausas.aprovar', 'pausa', 'Pedido de pausa',
      format('%s pediu pausa na %s (%s): %s', coalesce(v_nome, 'Montador'), coalesce(v_modelo, 'moto'), coalesce(v_sku, '-'), coalesce(new.motivo, '')),
      '/dashboard', jsonb_build_object('solicitacao_id', new.id, 'sku', v_sku), new.montador_id);
  elsif tg_op = 'UPDATE' and old.status = 'pendente' and new.status in ('aprovado', 'rejeitado') then
    perform privado.notificar_funcionario(new.montador_id, 'pausa',
      case when new.status = 'aprovado' then 'Pausa autorizada' else 'Pausa negada' end,
      format('%s — %s', coalesce(v_modelo, 'moto'), coalesce(new.motivo, '')), '/montagem',
      jsonb_build_object('solicitacao_id', new.id, 'sku', v_sku));
  end if;
  return new;
end $$;
drop trigger if exists notificar_solicitacao_pausa on public.solicitacoes_pausa;
create trigger notificar_solicitacao_pausa after insert or update of status on public.solicitacoes_pausa
  for each row execute function privado.notificar_solicitacao_pausa();

-- Eventos do fluxo da moto
create or replace function privado.notificar_fluxo_moto()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_descricao text := format('%s (%s)', coalesce(new.modelo, 'Moto'), new.sku);
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'retrabalho_montagem' and new.montador_id is not null then
    perform privado.notificar_funcionario(new.montador_id, 'retrabalho', 'Moto devolvida para retrabalho',
      format('%s: %s', v_descricao, coalesce(replace(new.observacoes, 'RETRABALHO: ', ''), 'ver detalhes')), '/montagem',
      jsonb_build_object('sku', new.sku));
  elsif new.status like 'avaria\_%' and coalesce(old.status, '') not like 'avaria\_%' then
    perform privado.notificar_permissao('avarias.reparar', 'avaria', 'Nova moto no pátio de avarias',
      format('%s: %s', v_descricao, coalesce(new.detalhes_avaria, new.status)), '/avarias',
      jsonb_build_object('sku', new.sku));
  elsif old.status like 'avaria\_%' and new.status = 'em_analise' then
    perform privado.notificar_permissao('qualidade.inspecionar', 'reparo', 'Reparo concluído: reinspecionar',
      format('%s reparada por %s', v_descricao, coalesce(new.tecnico_reparo, 'oficina')), '/qualidade',
      jsonb_build_object('sku', new.sku));
  end if;
  return new;
end $$;
drop trigger if exists notificar_fluxo_moto on public.motos;
create trigger notificar_fluxo_moto after update of status on public.motos
  for each row execute function privado.notificar_fluxo_moto();

-- -------------------------------------------------------------------------------------
-- 9. Fotos (avarias e qualidade) — Supabase Storage
-- -------------------------------------------------------------------------------------
create table if not exists public.fotos_moto (
  id         uuid primary key default gen_random_uuid(),
  moto_id    uuid not null references public.motos(id) on delete cascade,
  sku        text,
  etapa      text not null check (etapa in ('qualidade', 'avaria', 'reparo', 'outro')),
  caminho    text not null unique,
  legenda    text,
  autor_id   uuid references public.funcionarios(id) on delete set null default privado.funcionario_id(),
  created_at timestamptz not null default now()
);
create index if not exists fotos_moto_moto_idx on public.fotos_moto (moto_id, created_at);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-motos', 'fotos-motos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- -------------------------------------------------------------------------------------
-- 10. Inventário do pátio
-- -------------------------------------------------------------------------------------
create table if not exists public.inventarios (
  id             uuid primary key default gen_random_uuid(),
  descricao      text,
  status         text not null default 'aberto' check (status in ('aberto', 'finalizado', 'cancelado')),
  escopo         text[] not null default array['estoque'],
  iniciado_por   uuid references public.funcionarios(id) on delete set null default privado.funcionario_id(),
  iniciado_em    timestamptz not null default now(),
  finalizado_por uuid references public.funcionarios(id) on delete set null,
  finalizado_em  timestamptz,
  total_esperado int,
  total_lido     int,
  total_faltas   int,
  total_sobras   int,
  resultado      jsonb,
  observacoes    text
);
create unique index if not exists inventarios_um_aberto on public.inventarios ((true)) where status = 'aberto';

create table if not exists public.inventario_leituras (
  id             uuid primary key default gen_random_uuid(),
  inventario_id  uuid not null references public.inventarios(id) on delete cascade,
  sku            text not null,
  moto_id        uuid references public.motos(id) on delete set null,
  modelo         text,
  situacao       text not null check (situacao in ('confere', 'fora_do_escopo', 'nao_cadastrada')),
  status_sistema text,
  lido_por       uuid references public.funcionarios(id) on delete set null,
  lido_em        timestamptz not null default now(),
  unique (inventario_id, sku)
);
create index if not exists inventario_leituras_inv_idx on public.inventario_leituras (inventario_id, lido_em desc);

create or replace function public.registrar_leitura_inventario(p_inventario uuid, p_sku text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_sku text := upper(regexp_replace(coalesce(p_sku, ''), '\s', '', 'g'));
  v_inv public.inventarios;
  v_moto public.motos;
  v_leitura public.inventario_leituras;
  v_situacao text;
begin
  if not privado.tem_permissao('inventario.executar') then
    raise exception 'Sem permissão para registrar inventário' using errcode = '42501';
  end if;
  if length(v_sku) < 5 then
    raise exception 'Código inválido' using errcode = '22023';
  end if;
  select * into v_inv from public.inventarios where id = p_inventario for update;
  if v_inv.id is null or v_inv.status <> 'aberto' then
    raise exception 'Este inventário não está aberto' using errcode = '22023';
  end if;

  select * into v_leitura from public.inventario_leituras where inventario_id = p_inventario and sku = v_sku;
  if v_leitura.id is not null then
    return jsonb_build_object('situacao', 'duplicada', 'sku', v_sku, 'modelo', v_leitura.modelo,
                              'status_sistema', v_leitura.status_sistema, 'leitura_id', v_leitura.id);
  end if;

  select * into v_moto from public.motos where upper(sku) = v_sku order by created_at desc limit 1;
  v_situacao := case when v_moto.id is null then 'nao_cadastrada'
                     when v_moto.status = any (v_inv.escopo) then 'confere'
                     else 'fora_do_escopo' end;

  insert into public.inventario_leituras (inventario_id, sku, moto_id, modelo, situacao, status_sistema, lido_por)
  values (p_inventario, v_sku, v_moto.id, v_moto.modelo, v_situacao, v_moto.status, privado.funcionario_id())
  returning * into v_leitura;

  return jsonb_build_object('situacao', v_situacao, 'sku', v_sku, 'modelo', v_moto.modelo,
                            'status_sistema', v_moto.status, 'leitura_id', v_leitura.id);
end $$;
revoke all on function public.registrar_leitura_inventario(uuid, text) from public, anon;
grant execute on function public.registrar_leitura_inventario(uuid, text) to authenticated;

create or replace function public.finalizar_inventario(p_inventario uuid, p_observacoes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.inventarios;
  v_faltas jsonb;
  v_sobras jsonb;
  v_esperado int;
  v_lido int;
begin
  if not privado.tem_permissao('inventario.executar') then
    raise exception 'Sem permissão para finalizar inventário' using errcode = '42501';
  end if;
  select * into v_inv from public.inventarios where id = p_inventario for update;
  if v_inv.id is null or v_inv.status <> 'aberto' then
    raise exception 'Este inventário não está aberto' using errcode = '22023';
  end if;

  select count(*) into v_esperado from public.motos m where m.status = any (v_inv.escopo);
  select count(*) into v_lido from public.inventario_leituras l where l.inventario_id = p_inventario;

  select coalesce(jsonb_agg(jsonb_build_object('sku', m.sku, 'modelo', m.modelo, 'status', m.status, 'localizacao', m.localizacao) order by m.modelo, m.sku), '[]'::jsonb)
    into v_faltas
    from public.motos m
   where m.status = any (v_inv.escopo)
     and not exists (select 1 from public.inventario_leituras l where l.inventario_id = p_inventario and l.sku = upper(m.sku));

  select coalesce(jsonb_agg(jsonb_build_object('sku', l.sku, 'modelo', l.modelo, 'situacao', l.situacao, 'status_sistema', l.status_sistema) order by l.lido_em), '[]'::jsonb)
    into v_sobras
    from public.inventario_leituras l
   where l.inventario_id = p_inventario and l.situacao <> 'confere';

  update public.inventarios
     set status = 'finalizado',
         finalizado_por = privado.funcionario_id(),
         finalizado_em = now(),
         total_esperado = v_esperado,
         total_lido = v_lido,
         total_faltas = jsonb_array_length(v_faltas),
         total_sobras = jsonb_array_length(v_sobras),
         resultado = jsonb_build_object('faltas', v_faltas, 'sobras', v_sobras),
         observacoes = coalesce(nullif(trim(p_observacoes), ''), observacoes)
   where id = p_inventario
   returning * into v_inv;

  if v_inv.total_faltas + v_inv.total_sobras > 0 then
    perform privado.notificar_permissao('estoque.editar', 'inventario', 'Inventário com divergências',
      format('%s falta(s) e %s sobra(s) na contagem "%s".', v_inv.total_faltas, v_inv.total_sobras, coalesce(v_inv.descricao, 'sem descrição')),
      '/inventario', jsonb_build_object('inventario_id', v_inv.id), privado.funcionario_id());
  end if;

  return to_jsonb(v_inv);
end $$;
revoke all on function public.finalizar_inventario(uuid, text) from public, anon;
grant execute on function public.finalizar_inventario(uuid, text) to authenticated;

-- -------------------------------------------------------------------------------------
-- 11. Proteção dos perfis de sistema
-- -------------------------------------------------------------------------------------
create or replace function privado.proteger_perfis()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.sistema then
      raise exception 'Perfis padrão do sistema não podem ser excluídos' using errcode = '42501';
    end if;
    return old;
  end if;

  if not (new.permissoes <@ privado.permissoes_validas()) then
    raise exception 'Permissão desconhecida no perfil %', new.chave using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' then
    if old.sistema and (new.chave <> old.chave or not new.sistema) then
      raise exception 'A chave de um perfil padrão não pode mudar' using errcode = '42501';
    end if;
    if old.chave = 'master' and auth.uid() is not null and not privado.eh_master() then
      raise exception 'Somente um Master pode alterar o perfil Master' using errcode = '42501';
    end if;
    new.updated_at := now();
  end if;
  if tg_op = 'INSERT' and new.sistema and auth.uid() is not null then
    new.sistema := false;
  end if;
  return new;
end $$;
drop trigger if exists proteger_perfis on public.perfis;
create trigger proteger_perfis before insert or update or delete on public.perfis
  for each row execute function privado.proteger_perfis();

-- -------------------------------------------------------------------------------------
-- 12. RLS das tabelas NOVAS (as tabelas da V1 só recebem RLS na fase 4)
-- -------------------------------------------------------------------------------------
alter table public.perfis enable row level security;
alter table public.notificacoes enable row level security;
alter table public.fotos_moto enable row level security;
alter table public.inventarios enable row level security;
alter table public.inventario_leituras enable row level security;

drop policy if exists perfis_leitura on public.perfis;
create policy perfis_leitura on public.perfis for select to authenticated
  using ((select privado.eh_funcionario_ativo()));
drop policy if exists perfis_insercao on public.perfis;
create policy perfis_insercao on public.perfis for insert to authenticated
  with check ((select privado.tem_permissao('perfis.gerenciar')));
drop policy if exists perfis_atualizacao on public.perfis;
create policy perfis_atualizacao on public.perfis for update to authenticated
  using ((select privado.tem_permissao('perfis.gerenciar')))
  with check ((select privado.tem_permissao('perfis.gerenciar')));
drop policy if exists perfis_exclusao on public.perfis;
create policy perfis_exclusao on public.perfis for delete to authenticated
  using ((select privado.tem_permissao('perfis.gerenciar')));

drop policy if exists notificacoes_proprias on public.notificacoes;
create policy notificacoes_proprias on public.notificacoes for select to authenticated
  using (funcionario_id = (select privado.funcionario_id()));
drop policy if exists notificacoes_marcar_lida on public.notificacoes;
create policy notificacoes_marcar_lida on public.notificacoes for update to authenticated
  using (funcionario_id = (select privado.funcionario_id()))
  with check (funcionario_id = (select privado.funcionario_id()));
drop policy if exists notificacoes_excluir on public.notificacoes;
create policy notificacoes_excluir on public.notificacoes for delete to authenticated
  using (funcionario_id = (select privado.funcionario_id()));
revoke insert, update on public.notificacoes from anon, authenticated;
grant update (lida_em) on public.notificacoes to authenticated;

drop policy if exists fotos_leitura on public.fotos_moto;
create policy fotos_leitura on public.fotos_moto for select to authenticated
  using ((select privado.eh_funcionario_ativo()));
drop policy if exists fotos_insercao on public.fotos_moto;
create policy fotos_insercao on public.fotos_moto for insert to authenticated
  with check ((select privado.tem_alguma_permissao(array['qualidade.inspecionar', 'avarias.reparar']))
              and autor_id is not distinct from (select privado.funcionario_id()));
drop policy if exists fotos_exclusao on public.fotos_moto;
create policy fotos_exclusao on public.fotos_moto for delete to authenticated
  using (autor_id = (select privado.funcionario_id()) or (select privado.eh_master()));

drop policy if exists inventarios_leitura on public.inventarios;
create policy inventarios_leitura on public.inventarios for select to authenticated
  using ((select privado.tem_alguma_permissao(array['inventario.executar', 'estoque.ver'])));
drop policy if exists inventarios_insercao on public.inventarios;
create policy inventarios_insercao on public.inventarios for insert to authenticated
  with check ((select privado.tem_permissao('inventario.executar')) and status = 'aberto'
              and iniciado_por is not distinct from (select privado.funcionario_id()));
drop policy if exists inventarios_cancelamento on public.inventarios;
create policy inventarios_cancelamento on public.inventarios for update to authenticated
  using ((select privado.tem_permissao('inventario.executar')) and status = 'aberto')
  with check (status in ('aberto', 'cancelado'));

drop policy if exists leituras_leitura on public.inventario_leituras;
create policy leituras_leitura on public.inventario_leituras for select to authenticated
  using ((select privado.tem_alguma_permissao(array['inventario.executar', 'estoque.ver'])));
drop policy if exists leituras_desfazer on public.inventario_leituras;
create policy leituras_desfazer on public.inventario_leituras for delete to authenticated
  using ((select privado.tem_permissao('inventario.executar'))
         and exists (select 1 from public.inventarios i where i.id = inventario_id and i.status = 'aberto'));
revoke insert, update on public.inventario_leituras from anon, authenticated;

-- Storage: fotos das motos (bucket privado)
drop policy if exists "fotos-motos leitura" on storage.objects;
create policy "fotos-motos leitura" on storage.objects for select to authenticated
  using (bucket_id = 'fotos-motos' and (select privado.eh_funcionario_ativo()));
drop policy if exists "fotos-motos envio" on storage.objects;
create policy "fotos-motos envio" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos-motos'
              and (select privado.tem_alguma_permissao(array['qualidade.inspecionar', 'avarias.reparar'])));
drop policy if exists "fotos-motos exclusao" on storage.objects;
create policy "fotos-motos exclusao" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos-motos' and (owner_id = (select auth.uid())::text or (select privado.eh_master())));

-- -------------------------------------------------------------------------------------
-- 13. Tempo real (notificações e pedidos de pausa)
-- -------------------------------------------------------------------------------------
do $$
declare v_tabela text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_tabela in array array['notificacoes', 'solicitacoes_pausa'] loop
      if not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_tabela) then
        execute format('alter publication supabase_realtime add table public.%I', v_tabela);
      end if;
    end loop;
  end if;
end $$;

commit;

-- Faz a API enxergar as novas tabelas e funções imediatamente
notify pgrst, 'reload schema';
