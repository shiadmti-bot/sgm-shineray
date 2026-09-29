# Implantação da V2 do SGM

Este guia leva o SGM da V1 (login conferido no navegador, banco aberto para a chave pública) para a V2
(login pelo **Supabase Auth**, **perfis de acesso (RBAC)** e **regras no banco (RLS)**).

A migração é feita em fases para que nada pare de funcionar de uma vez:

| Fase | O que faz | A V1 continua funcionando? | Tem volta? |
|------|-----------|----------------------------|------------|
| 1. Estrutura (SQL) | Cria perfis, permissões, notificações, fotos, inventário, funções e gatilhos | Sim | Sim (objetos novos, a V1 não os usa) |
| 2. Usuários (script) | Cria o acesso de cada funcionário no Supabase Auth com a senha/PIN atual | Sim | Sim |
| 3. Publicar a V2 (Vercel) | Nova versão do aplicativo | — | Sim (promover a publicação anterior) |
| 4. Segurança no banco (SQL) | Liga o RLS nas tabelas antigas | **Não** | Sim, com o SQL de emergência abaixo |
| 5. Limpeza (SQL) | Apaga as senhas em texto puro da V1 | Não | **Não** |

> **Faça tudo primeiro em um projeto Supabase de teste.** Veja "Ambiente de teste" no fim deste guia.

---

## Antes de começar

1. **Backup**: Supabase > *Database* > *Backups*. Confirme que existe um backup recente (ou gere um dump pelo
   Supabase CLI). A fase 5 apaga dados (a coluna de senhas) e não pode ser desfeita.
2. **Chave service_role**: Supabase > *Project Settings* > *API* > `service_role`. Ela ignora todas as regras
   de segurança: **nunca** coloque em variável `NEXT_PUBLIC_*`, em planilhas ou no chat da equipe.
3. **Node.js 20+** no computador de quem vai rodar a fase 2 (script de migração dos usuários).
4. Combine uma janela de alguns minutos sem uso da linha para as fases 3 e 4 (os tablets precisam ser
   recarregados).

---

## Fase 1 — Estrutura (SQL)

1. Supabase > *SQL Editor* > *New query*.
2. Cole o conteúdo de `supabase/migrations/20261001100000_v2_fase1_estrutura.sql` e execute.
3. Leia as mensagens (aba *Results*/*Messages*):
   - **"Esquema diferente do esperado"**: o banco não tem alguma coluna usada pela V2. Nada foi gravado.
     Envie a mensagem para o suporte antes de continuar.
   - **"Funcionários sem perfil"**: cargos que não são `master`, `gestor`, `supervisor` ou `montador`.
     Essas pessoas ficam sem acesso até receberem um perfil (tela *Equipe* na V2).
   - **"ativo vazio"**: funcionários com o campo `ativo` sem valor são tratados como **inativos**.
     Marque `ativo = true` para quem ainda trabalha na empresa.
   - **"chassis duplicados"**: o índice de chassi único não foi criado. Corrija os duplicados e rode a fase 1 de novo.
   - **"convertida de ENUM para texto"**: informativo; a V1 continua funcionando.

A fase 1 pode ser executada mais de uma vez.

### Configurações do Supabase Auth

Em *Authentication*:

- *Sign In / Providers* > **Email** habilitado.
- **Desligue "Allow new users to sign up"** (cadastro público). Na V2 os acessos são criados só pela
  tela *Equipe* (servidor) e pelo script da fase 2. Com o cadastro público ligado, qualquer pessoa com a
  chave pública poderia criar uma conta (ela não veria nenhum dado, mas não há motivo para permitir).
- O tamanho mínimo de senha do Supabase (padrão: 6) precisa ser **6 ou menos**: os PINs viram senhas
  internas de 15 caracteres, e as senhas atuais da V1 têm pelo menos 6.

---

## Fase 2 — Acessos no Supabase Auth (script)

No computador com o repositório (`npm install` já executado):

```bash
# 1) Simulação: mostra o que será feito, sem alterar nada
SUPABASE_URL=https://SEU-PROJETO.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
node scripts/migrar-usuarios-auth.mjs

# 2) Execução
SUPABASE_URL=https://SEU-PROJETO.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
node scripts/migrar-usuarios-auth.mjs --aplicar
```

No Windows (PowerShell): `$env:SUPABASE_URL="..."; $env:SUPABASE_SERVICE_ROLE_KEY="..."; node scripts/migrar-usuarios-auth.mjs`.

O relatório mostra, para cada funcionário, o login e a ação (`criado`, `atualizado`, `já migrado`, `IGNORADO`, `ERRO`):

- **Login**: quem tem matrícula entra com a matrícula (internamente `<matricula>@shineray.sys`);
  quem não tem entra com o e-mail.
- **Perfis com PIN** (montador): o PIN de 4 números continua o mesmo.
- **Demais perfis**: a senha continua a mesma. Senhas com menos de 6 caracteres recebem uma
  **SENHA TEMPORÁRIA** (troca obrigatória no primeiro acesso) e PINs inválidos recebem um **PIN TEMPORÁRIO**:
  anote e entregue pessoalmente; depois limpe o histórico do terminal.
- **IGNORADO**: sem matrícula nem e-mail válido, ou login repetido. Corrija o cadastro e rode de novo.
- Contas criadas pela V1 no Supabase Auth ("usuários sombra") são reaproveitadas.
- Pode rodar de novo: quem já foi migrado não tem a senha alterada (só o bloqueio de arquivados é sincronizado).
- Se alguém for **cadastrado na V1** depois desta fase, rode a fase 1 e o script de novo antes de publicar a V2
  (a fase 1 atribui o perfil pelo cargo; o script cria o acesso que faltar).
- Senhas/PINs **trocados na V1** depois desta fase **não** são copiados de novo (o script preserva o acesso já
  criado). Nesses casos, redefina a senha/PIN pela tela *Equipe* da V2.

---

## Fase 3 — Publicar a V2 (Vercel)

1. Vercel > projeto > *Settings* > *Environment Variables*:
   - `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`: as mesmas de hoje.
   - **Nova**: `SUPABASE_SERVICE_ROLE_KEY` = chave service_role, **somente** em *Production* (e *Preview*,
     se usar um projeto Supabase de teste nas prévias). Sem ela a tela *Equipe* avisa que o servidor não está configurado.
2. Publique a branch da V2.
3. Teste com uma pessoa de cada perfil:
   - montador: aba **PIN da linha** (matrícula + PIN) → cai na *Montagem*;
   - supervisor: matrícula (ou e-mail) + senha → *Qualidade*;
   - gestor → *Central da linha*; master → *Central da linha* com *Perfis de acesso* no menu.
4. Recarregue os tablets (feche e abra o app instalado). A V2 descarta a sessão antiga da V1.

Até a fase 4 a V1 ainda funciona: se algo der errado, basta promover a publicação anterior na Vercel.

---

## Fase 4 — Segurança no banco (SQL)

1. *SQL Editor* > conteúdo de `supabase/migrations/20261001100100_v2_fase4_rls.sql` > executar.
2. A mensagem **"tabelas sem RLS"** lista tabelas do schema `public` que continuam abertas para a chave
   pública (se houver tabelas que o SGM não conhece). Avalie cada uma.
3. A partir daqui a V1 para de funcionar (ela lia o banco sem login). Tablets com a V1 aberta precisam ser recarregados.

O que passa a valer no banco (independentemente do aplicativo):

- Só funcionários **ativos** com login leem dados; ninguém lê a coluna de senha da V1.
- Cada mudança de etapa da moto é conferida pela permissão de quem executa (ex.: só quem tem
  "Inspecionar (QA)" aprova; só o próprio montador finaliza a sua montagem; o chassi não muda).
- Horários de início/fim de montagem vêm do relógio do servidor; o tempo de pausa é descontado e o
  fim da pausa é registrado automaticamente ao retomar.
- Auditoria: autor e horário definidos pelo servidor; ninguém altera ou apaga registros.
- Cadastro de pessoas e senhas: só pelo servidor (tela *Equipe*).

### Tempo real

O painel de pedidos de pausa e o sino de notificações usam o **Realtime** do Supabase quando disponível
(a fase 1 inclui `notificacoes` e `solicitacoes_pausa` na publicação `supabase_realtime`). Sem Realtime,
tudo continua funcionando com atualização periódica (20 a 60 segundos).

---

## Fase 5 — Limpeza (SQL, sem volta)

Depois de alguns dias de uso normal da V2 (todos já entraram pelo menos uma vez):

1. Confirme o backup.
2. Execute `supabase/migrations/20261001100200_v2_fase5_limpeza.sql`.

Isso apaga a coluna `funcionarios.senha` (senhas e PINs em texto puro da V1) e remove o acesso residual
da chave pública às tabelas.

---

## Reversão de emergência

**Antes da fase 4**: Vercel > *Deployments* > publicação da V1 > *Promote to Production*. Nada no banco precisa mudar.

**Depois da fase 4 e antes da fase 5**: volte a publicação da V1 na Vercel e execute no *SQL Editor*:

```sql
-- Reabre as tabelas da V1 para a chave pública (situação anterior à fase 4)
alter table public.funcionarios disable row level security;
alter table public.motos disable row level security;
alter table public.solicitacoes_pausa disable row level security;
alter table public.pausas_producao disable row level security;
alter table public.historico_avarias disable row level security;
alter table public.logs_sistema disable row level security;
drop trigger if exists validar_moto on public.motos;
grant select, insert, update, delete on public.funcionarios, public.motos, public.solicitacoes_pausa,
  public.pausas_producao, public.historico_avarias, public.logs_sistema to anon, authenticated;
drop policy if exists configuracoes_leitura on public.configuracoes_sistema;
drop policy if exists configuracoes_insercao on public.configuracoes_sistema;
drop policy if exists configuracoes_atualizacao on public.configuracoes_sistema;
create policy configuracoes_leitura on public.configuracoes_sistema for select to anon, authenticated using (true);
create policy configuracoes_insercao on public.configuracoes_sistema for insert to anon, authenticated with check (true);
create policy configuracoes_atualizacao on public.configuracoes_sistema for update to anon, authenticated using (true) with check (true);
grant select, insert, update on public.configuracoes_sistema to anon, authenticated;
notify pgrst, 'reload schema';
```

Isso devolve a exposição de dados da V1 — use só enquanto corrige o problema e reaplique a fase 4 em seguida.

**Depois da fase 5**: a V1 não funciona mais (as senhas dela foram apagadas). Corrija para frente.

---

## Problemas comuns

| Sintoma | Causa provável / solução |
|---------|--------------------------|
| "Usuário ou senha incorretos" para alguém que existe | Sem acesso no Auth (*Equipe* mostra "Sem acesso"): edite a pessoa e defina senha/PIN — o acesso é criado na hora. Arquivados não entram. |
| "Seu cadastro está inativo ou sem perfil de acesso" | Defina o perfil na tela *Equipe* ou reative a pessoa. |
| *Equipe* mostra "Servidor sem a variável SUPABASE_SERVICE_ROLE_KEY" | Configure a variável na Vercel e publique de novo. |
| Montador não consegue entrar com PIN | A matrícula precisa ter só números e o perfil precisa ter "Acesso pela linha (PIN)". |
| Erro ao enviar foto | Confira se o bucket `fotos-motos` existe (*Storage*) e se as políticas "fotos-motos …" aparecem em *Storage* > *Policies*. Se o SQL da fase 1 não conseguir criá-las no seu projeto, crie pelo painel com as mesmas regras. |
| Tela "sem permissão" para uma ação | Ajuste o perfil em *Perfis de acesso* (somente Master). A mudança vale em até 3 minutos para quem está logado. |
| Notificações demoram | Sem Realtime habilitado o sino atualiza a cada 60 s. |

---

## Ambiente de teste

Opções, da mais fiel para a mais simples:

1. **Cópia do banco de produção** em um projeto novo (restauração de backup em outro projeto, ou `pg_dump`/`pg_restore`
   pelo Supabase CLI). Depois aplique as fases 1, 2 e 4 nele e aponte uma publicação de prévia da Vercel para ele.
2. **Projeto vazio**: execute `docs/teste/esquema-base-v1.sql` (estrutura da V1 **reconstruída a partir do código**,
   com dados fictícios) e depois as fases 1, 2 e 4. Serve para treinar a equipe, mas pode diferir do banco real
   em detalhes que o código não revela.

### Checklist de validação

- [ ] Cada perfil entra e vê só o próprio menu.
- [ ] Montador: iniciar, pedir pausa, retomar, finalizar.
- [ ] Supervisor: autorizar pausa, aprovar, devolver para retrabalho, reprovar com foto.
- [ ] Avarias: reparo com foto; a moto volta para a Qualidade e a Qualidade recebe notificação.
- [ ] Etiquetagem e estoque: imprimir, enviar ao estoque, expedir.
- [ ] Inventário: iniciar, bipar, finalizar e exportar.
- [ ] Equipe: cadastrar montador (PIN) e supervisor (senha provisória → troca obrigatória), arquivar e restaurar.
- [ ] Prontuário (Ctrl+K) mostra a linha do tempo completa de uma moto.
- [ ] Auditoria registra as ações com o autor correto.
