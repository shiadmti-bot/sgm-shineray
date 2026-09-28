# Perfis de acesso (RBAC) no SGM V2

Cada colaborador tem **um perfil**; cada perfil tem uma lista de **permissões**. O perfil **Master** tem acesso total.

As mesmas regras valem em dois lugares:

1. **Aplicativo**: monta o menu, protege as telas e esconde botões (`src/lib/rbac/`).
2. **Banco de dados (RLS + gatilhos)**: confere cada leitura e gravação, mesmo que alguém use a API diretamente
   (`supabase/migrations/*_v2_fase1_estrutura.sql` e `*_v2_fase4_rls.sql`).

## Permissões

| Chave | Nome na tela | Libera |
|-------|--------------|--------|
| `painel.ver` | Ver o painel | Tela Painel |
| `prontuario.ver` | Consultar prontuário | Prontuário e busca de chassi (Ctrl+K) |
| `scanner.registrar` | Registrar entrada | Tela Entrada (scanner); cadastrar moto como "aguardando montagem" |
| `montagem.executar` | Montar motos | Tela Montagem: assumir, pedir pausa, retomar e finalizar a própria montagem |
| `montagem.remover` | Remover da fila | Excluir moto que ainda aguarda montagem |
| `pausas.aprovar` | Autorizar pausas | Pedidos de pausa; pausar/retomar montagem de outra pessoa |
| `qualidade.inspecionar` | Inspecionar (QA) | Tela Qualidade: aprovar, retrabalho, avaria; fotos |
| `avarias.ver` | Ver pátio de avarias | Tela Avarias (consulta) |
| `avarias.reparar` | Registrar reparos | Concluir reparo (volta para a Qualidade); fotos |
| `etiquetas.imprimir` | Imprimir etiquetas | Etiquetagem e reimpressão; enviar ao estoque |
| `etiquetas.layout` | Editar layout de etiquetas | Editor de modelos de etiqueta |
| `estoque.ver` | Ver estoque | Tela Estoque; histórico de inventários |
| `estoque.editar` | Editar estoque | Corrigir modelo/cores, localização e reverter para etiquetagem |
| `estoque.expedir` | Registrar expedição | Saída de motos do estoque |
| `inventario.executar` | Fazer inventário | Iniciar, bipar, finalizar e cancelar inventários |
| `relatorios.ver` | Ver relatórios | Tela Relatórios |
| `equipe.ver` | Ver equipe | Tela Equipe (consulta, último acesso, desempenho) |
| `equipe.gerenciar` | Gerenciar equipe | Cadastrar, editar, redefinir senha/PIN, arquivar e restaurar |
| `perfis.gerenciar` | Gerenciar perfis de acesso | Tela Perfis de acesso |
| `auditoria.ver` | Ver auditoria | Todos os eventos, inclusive logins |
| `configuracoes.gerenciar` | Alterar configurações | Tela Configurações |

## Perfis que vêm prontos

| Perfil | Acesso | Tela inicial | Permissões |
|--------|--------|--------------|------------|
| Master | Senha | Painel | Todas |
| Gestor | Senha | Painel | Todas, exceto `montagem.executar`, `montagem.remover` e `perfis.gerenciar` |
| Supervisor | Senha | Qualidade | Painel, prontuário, entrada, montagem, remover da fila, pausas, qualidade, avarias (ver/reparar), imprimir etiquetas, estoque (ver/editar/expedir), inventário |
| Montador | Matrícula + PIN | Montagem | Entrada, montagem, remover da fila, imprimir etiquetas |

Os perfis padrão não podem ser excluídos nem ter o identificador alterado; o Master só pode ser alterado por um Master.
Crie perfis novos (ex.: "Expedição", "Oficina") em **Perfis de acesso** — use **Duplicar** para partir de um existente.

## Regras de hierarquia (tela Equipe)

- Só um **Master** cria ou altera contas Master.
- Perfis com `perfis.gerenciar` só podem ser atribuídos por quem também tem essa permissão.
- Ninguém muda o próprio perfil nem arquiva a própria conta.
- Arquivar bloqueia o login e corta o acesso aos dados na hora (o banco só atende funcionários ativos).
- Mudar alguém entre um perfil com PIN e um perfil com senha exige definir a nova credencial.
- Senha definida pelo gestor pode exigir **troca no primeiro acesso** (padrão ligado).

## Regras do fluxo da moto (conferidas no banco)

Gatilho `privado.validar_moto()` em cada alteração de `motos` (exceto Master e servidor):

| De → Para | Exige |
|-----------|-------|
| aguardando_montagem → em_producao | `montagem.executar`, assumindo para si mesmo |
| retrabalho_montagem → em_producao | `montagem.executar`; volta para quem montou (ou qualquer montador, se essa pessoa foi arquivada); `pausas.aprovar` pode assumir |
| em_producao → em_analise / pausado → em_producao | `montagem.executar` e ser o montador da moto (ou `pausas.aprovar`) |
| em_producao → pausado | `pausas.aprovar` |
| em_analise → aguardando_etiqueta / retrabalho_montagem / avaria_* | `qualidade.inspecionar` |
| avaria_* → em_analise | `avarias.reparar` |
| aguardando_etiqueta → estoque | `etiquetas.imprimir` |
| estoque → aguardando_etiqueta | `estoque.editar` |
| estoque → expedido | `estoque.expedir` |
| mesma etapa (edição de dados) | `estoque.editar`; ou o próprio montador salvando cor/banco/observação durante a montagem |

Também no gatilho: chassi e data de entrada não mudam; montador/inspetor só podem ser gravados como o próprio
usuário; o contador de retrabalho só sobe de 1 em 1 na devolução pela Qualidade; horários de início/fim da
montagem vêm do servidor; ao retomar uma pausa, o tempo parado é descontado e a pausa é encerrada.

## Notificações automáticas

| Evento | Quem recebe |
|--------|-------------|
| Pedido de pausa | Quem tem `pausas.aprovar` (exceto o próprio montador) |
| Pausa autorizada/negada | O montador |
| Moto devolvida para retrabalho | O montador da moto |
| Moto enviada para avaria | Quem tem `avarias.reparar` |
| Reparo concluído | Quem tem `qualidade.inspecionar` |
| Inventário com divergências | Quem tem `estoque.editar` (exceto quem finalizou) |

O perfil Master não recebe notificações operacionais (não está nas listas de permissão).

## Como criar uma permissão nova

1. Acrescente a chave em `privado.permissoes_validas()` (nova migração SQL) — o banco recusa perfis com permissões desconhecidas.
2. Acrescente a mesma chave em `src/lib/rbac/permissoes.ts` (nome, grupo e descrição).
3. Use-a no aplicativo (`usePode("...")`, `ROTAS` em `src/lib/rbac/rotas.ts`) e nas políticas RLS (`privado.tem_permissao('...')`).
