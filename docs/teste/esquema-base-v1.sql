-- =====================================================================================
-- SGM — estrutura da V1 para AMBIENTE DE TESTE
-- -------------------------------------------------------------------------------------
-- ATENÇÃO: reconstruída a partir do código do aplicativo (nomes de tabelas, colunas e
-- chaves estrangeiras usados nas consultas). NÃO é uma cópia do banco de produção e pode
-- diferir dele em tipos, padrões e colunas que o código não usa.
--
-- Use somente em um projeto Supabase NOVO e vazio, para treinar a equipe ou testar a V2:
--   1. este arquivo (estrutura + dados fictícios);
--   2. supabase/migrations/20260928120000_configuracoes_sistema.sql (opcional);
--   3. fases da V2 conforme docs/implantacao-v2.md.
-- Nunca execute em produção.
-- =====================================================================================

create table public.funcionarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cargo text not null,
  matricula text,
  email text,
  senha text,
  ativo boolean default true,
  data_contratacao timestamptz,
  created_at timestamptz default now()
);
create table public.motos (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  modelo text, ano text, cor text, cor_banco text,
  status text default 'aguardando_montagem',
  localizacao text,
  montador_id uuid, supervisor_id uuid,
  inicio_montagem timestamptz, fim_montagem timestamptz,
  observacoes text, detalhes_avaria text, tecnico_reparo text,
  rework_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint motos_montador_id_fkey foreign key (montador_id) references public.funcionarios(id),
  constraint motos_supervisor_id_fkey foreign key (supervisor_id) references public.funcionarios(id)
);
create table public.solicitacoes_pausa (
  id uuid primary key default gen_random_uuid(),
  montador_id uuid, moto_id uuid, motivo text, status text default 'pendente', supervisor_id uuid,
  created_at timestamptz default now(), updated_at timestamptz,
  constraint solicitacoes_montador_id_fkey foreign key (montador_id) references public.funcionarios(id),
  constraint solicitacoes_moto_id_fkey foreign key (moto_id) references public.motos(id) on delete cascade
);
create table public.pausas_producao (
  id uuid primary key default gen_random_uuid(),
  moto_id uuid references public.motos(id) on delete cascade,
  montador_id uuid references public.funcionarios(id),
  motivo text, inicio timestamptz default now()
);
create table public.historico_avarias (
  id uuid primary key default gen_random_uuid(),
  moto_id uuid references public.motos(id) on delete cascade,
  sku text, modelo text, cor text, cor_banco text, tipo_avaria text, descricao_problema text,
  supervisor_id uuid references public.funcionarios(id), status_ticket text default 'pendente',
  data_reporte timestamptz, tecnico_nome text, descricao_solucao text, data_resolucao timestamptz,
  created_at timestamptz default now()
);
create table public.logs_sistema (
  id uuid primary key default gen_random_uuid(),
  acao text, usuario text, referencia text, detalhes jsonb, created_at timestamptz default now()
);

-- Dados fictícios (senhas/PINs de exemplo: troque antes de usar com pessoas reais)
insert into public.funcionarios (id, nome, cargo, matricula, email, senha, ativo) values
 ('00000000-0000-4000-a000-000000000001', 'Délcio TI', 'master', null, 'ti@shineray.local', 'master123', true),
 ('00000000-0000-4000-a000-000000000002', 'Gestora Ana', 'gestor', 'admin', 'ana@shineray.local', 'gestor123', true),
 ('00000000-0000-4000-a000-000000000003', 'Maria Supervisora', 'supervisor', '2001', null, 'super123', true),
 ('00000000-0000-4000-a000-000000000004', 'João Montador', 'montador', '1001', null, '1234', true),
 ('00000000-0000-4000-a000-000000000005', 'Carlos Silva', 'montador', '1002', null, '5678', true),
 ('00000000-0000-4000-a000-000000000006', 'Ex Funcionário', 'montador', '1003', null, '9999', false);

insert into public.motos (id, sku, modelo, ano, cor, cor_banco, status, localizacao, montador_id, supervisor_id, inicio_montagem, fim_montagem, created_at, updated_at, detalhes_avaria) values
 ('10000000-0000-4000-a000-000000000001','99HKC2200T8000222','KART CROSS 200 S','2026',null,null,'aguardando_montagem','Recebimento / CD',null,null,null,null, now()-interval '20 min', now()-interval '20 min', null),
 ('10000000-0000-4000-a000-000000000002','99HJF1150T8005555','JEF 150 S','2026',null,null,'em_producao','Box João','00000000-0000-4000-a000-000000000004',null, now()-interval '50 min', null, now()-interval '3 hour', now()-interval '50 min', null),
 ('10000000-0000-4000-a000-000000000003','99HSHF175T8000321','SHI 175 EFI','2026','Preta','Preto','em_analise','Pátio de Qualidade','00000000-0000-4000-a000-000000000005',null, now()-interval '3 hour', now()-interval '35 min', now()-interval '5 hour', now()-interval '35 min', null),
 ('10000000-0000-4000-a000-000000000004','99HNJ1125T8000462','JET 125 2026','2026','Vermelha','Preto','aguardando_etiqueta','Pátio Montada','00000000-0000-4000-a000-000000000004','00000000-0000-4000-a000-000000000003', now()-interval '6 hour', now()-interval '5 hour', now()-interval '8 hour', now()-interval '75 min', null),
 ('10000000-0000-4000-a000-000000000005','99HDRF012T8000888','DRIFT 01','2026','Azul','Preto','estoque','Pátio de Estoque','00000000-0000-4000-a000-000000000005','00000000-0000-4000-a000-000000000003', now()-interval '2 day', now()-interval '2 day', now()-interval '3 day', now()-interval '2 day', null),
 ('10000000-0000-4000-a000-000000000006','99HURF150T8000777','URBAN 150 EFI','2026','Branca','Preto','estoque','Pátio de Estoque','00000000-0000-4000-a000-000000000004','00000000-0000-4000-a000-000000000003', now()-interval '1 day', now()-interval '1 day', now()-interval '2 day', now()-interval '1 day', null),
 ('10000000-0000-4000-a000-000000000007','99HSB1250T8000111','SBM 250','2026','Preta Fosca','Preto','avaria_pintura','Pátio de Avarias','00000000-0000-4000-a000-000000000005','00000000-0000-4000-a000-000000000003', now()-interval '2 day', now()-interval '2 day', now()-interval '3 day', now()-interval '26 hour', 'Risco no tanque');

insert into public.historico_avarias (moto_id, sku, modelo, tipo_avaria, descricao_problema, supervisor_id, status_ticket, data_reporte)
 values ('10000000-0000-4000-a000-000000000007','99HSB1250T8000111','SBM 250','avaria_pintura','Risco no tanque','00000000-0000-4000-a000-000000000003','pendente', now()-interval '26 hour');

insert into public.logs_sistema (acao, usuario, referencia, detalhes, created_at) values
 ('APROVACAO_QA','Maria Supervisora','99HNJ1125T8000462', to_jsonb('{"supervisor":"Maria"}'::text), now()-interval '75 min'),
 ('LOGIN','Délcio TI','Sistema', to_jsonb('{"metodo":"Senha"}'::text), now()-interval '2 hour');
