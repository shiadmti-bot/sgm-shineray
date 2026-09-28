# Revisão geral do SGM — setembro/2026

Revisão de todos os módulos do sistema (login, dashboard, scanner, montagem, qualidade, avarias,
etiquetagem, estoque, relatórios, equipe, auditoria, perfil) com foco em falhas, pontos críticos,
usabilidade da operação e monitoramento pela administração. O módulo de etiquetas foi refeito para
ter layout personalizável.

Legenda: ✅ corrigido nesta revisão · ⚠️ pendente (depende de banco/infra)

---

## 1. Falhas críticas

| # | Problema encontrado | Risco | Situação |
|---|---|---|---|
| 1 | A página `/seed` era pública: um clique apagava motos, pausas e funcionários e recriava usuários com senhas padrão conhecidas. | Perda total de dados e acesso indevido. | ✅ Retorna 404, a menos que `SGM_HABILITAR_SEED=true` esteja no servidor; exige digitar "APAGAR TUDO". |
| 2 | Senha/PIN do usuário ficava em texto puro no navegador (`localStorage.sgm_user`), inclusive em tablets compartilhados. | Vazamento de credenciais. | ✅ A sessão guarda só id, nome, cargo, matrícula e e-mail. Sessões antigas são limpas automaticamente no primeiro acesso. |
| 3 | O login baixava a senha do funcionário para o navegador e comparava no cliente; o filtro `.or()` era montado com o texto digitado (injeção de filtro no PostgREST). | Exposição de senha e manipulação da consulta. | ✅ A senha é conferida no filtro da consulta (não é baixada), sem montar filtros com texto livre. Mensagem única "Usuário ou senha inválidos" e bloqueio de 30 s após 5 tentativas. Falhas ficam na auditoria (`LOGIN_FALHA`). |
| 4 | Um Gestor podia editar, rebaixar ou trocar a senha de contas Master. | Escalonamento de privilégio. | ✅ Só Master altera/arquiva contas Master; ninguém arquiva a própria conta. |
| 5 | Cadastros sem senha recebiam senhas padrão fracas (`1234`, `shineray123`); PIN/matrícula sem validação (montador podia ser cadastrado com um PIN que o teclado do login não aceita). | Contas vulneráveis e montadores sem acesso. | ✅ Senha obrigatória (mín. 6), PIN de exatamente 4 números, matrícula de 3 a 6 números, matrícula/e-mail únicos. PIN e senha nunca são exibidos na tela. |
| 6 | Etiqueta: dados da moto inseridos no HTML de impressão sem escape e código de barras dependente de CDN externo (sem internet, a etiqueta saía sem código). | Injeção de HTML/script e etiquetas ilegíveis. | ✅ Motor de etiquetas novo, com escape de todos os textos e códigos gerados localmente (sem CDN). |
| 7 | Condições de corrida: dois montadores podiam assumir a mesma caixa; duas estações podiam aprovar, reverter ou expedir a mesma moto; clique duplo duplicava registros de avaria. | Dados inconsistentes. | ✅ Toda mudança de status confere o status atual no próprio `UPDATE` e avisa se outra estação agiu antes; botões ficam travados durante o envio. |
| 8 | Várias gravações ignoravam erros e mostravam "sucesso" (reprovação no QA, reparo, expedição, pedido de pausa). | Operador acredita que salvou sem ter salvo. | ✅ Todos os fluxos tratam erro e informam o operador. |
| 9 | Usuário arquivado continuava com acesso indefinidamente (sessão sem expiração e sem revalidação). | Acesso de ex-colaboradores. | ✅ Sessão expira em 12 h; o sistema revalida o cadastro a cada 5 min (arquivado é desconectado; mudança de cargo é aplicada). |

## 2. Falhas funcionais corrigidas ✅

- **Redirecionamento por perfil:** o RoleGuard mandava montador e supervisor sem permissão para o **login** (procurava cargos inexistentes `mecanico`/`inspetor`). Agora cada perfil volta para a sua tela inicial.
- **Fuso horário:** "hoje" era calculado em UTC (dashboard, perfil) e os filtros de data da auditoria também — no Brasil o painel zerava às 21h e os filtros cortavam 3 horas do dia.
- **Meta diária:** contava caixas bipadas na entrada, não motos montadas, e o valor (35) estava fixo no código. Agora conta montagens finalizadas e é configurável.
- **Relatórios:** "Solicitações rejeitadas" era sempre 0 (o sistema grava `rejeitado`, o relatório procurava `rejeitada`); FPY e aprovadas ignoravam motos aprovadas que ainda aguardam etiqueta; a cor do card "Status do Fluxo" não era aplicada (classe Tailwind montada dinamicamente).
- **Qualidade:** a lista "piscava" (esqueleto de carregamento) a cada 5 segundos.
- **Auditoria:** os detalhes eram exibidos como texto JSON escapado e o dispositivo aparecia sempre como "Não identificado"; limite fixo de 200 registros sem aviso.
- **Timer de montagem:** a retomada calculava a pausa pelo `updated_at`, que não era atualizado ao pausar. Agora usa o início registrado em `pausas_producao` e o `updated_at` é gravado na pausa.
- **Eventos sem auditoria:** entrada pelo scanner (`ENTRADA_ESTOQUE` existia mas nunca era gravado), logout, arquivamento/restauração de colaborador, exclusão de moto da fila, rejeição e cancelamento de pausa, retomada, reversão de estoque (era gravada como `EDICAO`), reimpressão de etiqueta, troca de senha e alterações de configuração.
- **Sons:** o sistema tocava `/beep.mp3` e `/notification.mp3`, que não existem. Agora os bipes são gerados pelo navegador (sucesso, erro, alerta).
- **Sino do cabeçalho:** tinha um ponto vermelho piscando fixo, sem função. Agora mostra e abre as solicitações de pausa pendentes.
- **Impressão:** o cabeçalho preto da etiqueta podia sair em branco (o navegador não imprime fundos sem `print-color-adjust`).
- **Visual:** 42 ocorrências de classes Tailwind inexistentes em Qualidade e Estoque (ex.: `text-slate-850`, `bg-slate-550`, `to-indigo-850`) não aplicavam estilo; diálogos "largos" ficavam limitados a 512 px em telas grandes.
- **Tema:** o botão de tema da barra lateral não funcionava no primeiro clique quando o tema era "sistema".

## 3. Etiquetas personalizáveis ✅

- **Editor visual** (Etiquetagem → Layout das etiquetas, gestor/master) com pré-visualização idêntica à impressão.
- **Modelos:** criar, duplicar, excluir, importar/exportar JSON, definir padrão, restaurar modelos de fábrica.
- **Página:** tamanho (predefinições ou livre), margem, borda, linhas divisórias, fonte, cópias por moto e **calibração** (deslocamento horizontal/vertical em mm).
- **Blocos reordenáveis:** cabeçalho, modelo (com redução automática de fonte para nomes longos), cores, código de barras (Code128/Code39, esticar, texto), QR Code, chassi (destaque dos dígitos finais), lista de campos, texto livre, imagem/logo (P&B) e espaço. Cada bloco tem altura, alinhamento, fundo (branco/preto/cinza), linha divisória e opção de ocupar o espaço restante.
- **Variáveis:** `{chassi}`, `{chassi_final}`, `{modelo}`, `{cor}`, `{cor_banco}`, `{ano}`, `{montador}`, `{supervisor}`, `{localizacao}`, `{data}`, `{hora}`.
- **Modelos de fábrica:** "Etiqueta de Caixa" 100×150 mm (reproduz a etiqueta anterior) e "Etiqueta Sub-banco" 70×50 mm (citada no manual, mas não existia no sistema).
- **Operação:** busca/bipagem do chassi na fila com impressão automática opcional, seleção múltipla e impressão em lote, pré-visualização por moto, tempo de espera na fila, impressão por iframe (sem pop-up bloqueado), **conferência por leitura do código de barras** da etiqueta impressa (ou 4 últimos dígitos) antes de enviar ao estoque, e reimpressão direta a partir do estoque.
- Validação feita com leitor ZXing: o Code128 e o QR Code gerados decodificam o chassi corretamente; o PDF sai com uma etiqueta por página no tamanho exato.

## 4. Usabilidade por módulo ✅

- **Login:** "Continuar como …" quando há sessão ativa no dispositivo.
- **Scanner:** validação de caracteres do chassi (e alerta para I/O/Q), trava contra leitura dupla da câmera, histórico das últimas leituras, tratamento de chassi duplicado entre estações, modelos cadastrados em Configurações.
- **Montagem:** diálogos no lugar de `prompt()`/`confirm()` (ruins em tablet), motivos de pausa em botões, cancelamento do pedido de pausa, cronômetro com alerta acima do tempo de referência, contador do checklist, remoção de moto da fila com motivo e auditoria.
- **Qualidade:** tempo de espera de cada moto, campo de descrição maior, textos de botão coerentes com a ação.
- **Avarias:** tipo da avaria, tempo no pátio, sugestão de técnicos, painel de reparos concluídos (30 dias) com solução e tempo de resolução.
- **Estoque:** exportação CSV (abre direto no Excel em português), dias em estoque, reimpressão de etiqueta, sugestões de cores do catálogo na edição.
- **Perfil:** estatísticas corretas por perfil, troca de senha/PIN com confirmação e validação, tema automático.

## 5. Monitoramento pela administração ✅

- **Torre de Controle:** 7 indicadores do fluxo, meta diária (entradas, montadas e expedidas no dia), tempo ao vivo por box, painel de pausas, alertas automáticos e atividade recente.
- **Configurações do Sistema:** meta diária, tempo de referência de montagem, alerta de pausa longa, alerta de fila no QA, checklist, cores de carenagem/banco e **novos modelos por código VDS** (com teste de chassi) — sem precisar publicar nova versão.
- **Auditoria:** filtros por grupo de ação e por usuário, período no fuso local, paginação ("carregar mais"), resumo dos detalhes na lista e CSV em formato brasileiro.

## 6. Pendências recomendadas ⚠️

Itens que dependem do banco de dados/infraestrutura (não estão neste repositório) e por isso não foram alterados:

1. **Senhas em texto puro** na tabela `funcionarios`. Recomendado: migrar o login para o Supabase Auth (ou armazenar hash com `pgcrypto`/bcrypt e validar via função no banco).
2. **Autorização apenas na interface.** A chave anon do Supabase é pública (vai no JavaScript do site); o que ela consegue ler, alterar ou apagar depende das políticas RLS, que não estão no repositório. Verifique as políticas de `funcionarios`, `motos`, `logs_sistema` etc. Sem RLS por cargo, as restrições de tela não impedem chamadas diretas à API.
3. **Usuários de teste do `/seed`** (lista em `src/app/seed/SeedClient.tsx`): se alguma dessas contas existir em produção com a senha padrão, troque a senha ou arquive a conta.
4. **Chassi único:** criar índice único em `motos.sku` (o sistema já trata o erro de duplicidade `23505`).
5. **Duração das pausas:** registrar o fim em `pausas_producao` (ex.: coluna `fim`) para relatórios de tempo parado.
6. **Realtime:** habilitar o Realtime para `solicitacoes_pausa` (hoje há verificação periódica como reserva).
7. **Horário dos logs:** usar `default now()` em `logs_sistema.created_at`; hoje o horário vem do relógio do dispositivo.
8. **Configurações compartilhadas:** executar `supabase/migrations/20260928120000_configuracoes_sistema.sql`. As políticas dessa tabela seguem o modelo atual (chave anon); ao adotar o Supabase Auth, restrinja a escrita a gestor/master.
9. **Qualidade de código:** restam 85 usos de `any` (tipagem) e não há testes automatizados.

## 7. Como foi validado

- `tsc --noEmit` sem erros; `npm run build` concluído.
- ESLint: de 177 problemas (133 erros) para 92 (85 são `no-explicit-any` já existentes; nenhum erro de hooks).
- Teste no Chromium com um Supabase simulado: todas as telas carregam sem erros de JavaScript; fluxos exercitados — impressão em lote e conferência, bipagem com impressão automática, edição e salvamento de layout, configurações refletindo no painel, pausa/cancelamento/finalização da montagem, retrabalho no QA, reimpressão e exportação no estoque, redirecionamento por perfil, expiração de sessão e migração de sessão antiga.
- Não houve teste contra o banco real nem com a impressora física: recomenda-se um **Imprimir teste** na BY-480BT antes de liberar para a linha.
