📘 Documentação Técnica - SGM System (v1.5)
Status: Congelado (Frozen) para Refatoração V2.0

Data: 26/01/2026

Objetivo: Controle de entrada de chassis, monitoramento de linha de montagem, gestão de estoque e BI.

1. Stack Tecnológica
A versão 1.5 foi construída utilizando uma arquitetura Serverless com foco em performance no Frontend.

Frontend: Next.js 14 (App Router)

Linguagem: TypeScript

Estilização: Tailwind CSS + Shadcn/ui (Radix Primitives)

Animações: Framer Motion (framer-motion) + CSS Transitions

Backend / Banco de Dados: Supabase (PostgreSQL)

Integrações:

react-zxing: Leitura de código de barras via câmera.

recharts: Gráficos de BI e Dashboards.

exceljs: Exportação de relatórios complexos.

sonner: Sistema de notificações (Toasts).

lucide-react: Iconografia.

2. Arquitetura de Dados (Banco de Dados Atual)
Tabela: funcionarios
Gerencia todos os usuários do sistema.

Campos: id (uuid), nome, email (login gestor), senha (texto), matricula (login mecânico), pin (senha mecânico), cargo (master, gestor, inspetor, mecanico), ativo (boolean - Soft Delete), data_contratacao.

Tabela: motos
O coração do sistema. Cada registro é uma moto física.

Campos: id (uuid), sku (Chassi/VIN), modelo, cor, ano, status (montagem, estoque, reprovado, enviado), localizacao, montador_id (FK), tempo_montagem (int), observacoes, created_at.

Tabela: logs_sistema
Rastreabilidade de ações sensíveis.

Campos: id, autor_id, acao (CADASTRO, EDICAO, ARQUIVAMENTO), alvo, detalhes (JSONB).

3. Módulos Funcionais Desenvolvidos
🔐 3.1. Autenticação Híbrida
Implementamos um sistema de login duplo para atender perfis diferentes:

Administrativo (Master/Gestor): Login via E-mail e Senha (com toggle de "ver senha" e "lembrar de mim").

Operacional (Mecânico): Login simplificado via Matrícula e Teclado Numérico (PIN) para uso em tablets/totens.

📷 3.2. Scanner Inteligente (Porta de Entrada)
Módulo de leitura de VIN (Chassi) com lógica de decodificação proprietária da Shineray.

Validação: Verifica 17 dígitos.

Decodificação: Identifica WMI (99H -> Shineray), Ano (T -> 2026) e Fábrica (S -> Suape).

Automação: Ao ler, a moto é registrada automaticamente com status montagem e direcionada para a linha correta.

Hardware: Suporta Câmera (Tablet) e Pistola USB.

📊 3.3. Dashboard Operacional (Tempo Real)
Uma visão "Flash" para o gestor acompanhar o chão de fábrica agora.

KPIs: Produção do Dia, Aprovadas Hoje, Equipe Ativa.

Feed: Lista das últimas 5 motos bipadas/finalizadas.

Design: Cards com identidade visual por cor (status).

📈 3.4. Relatórios & BI (Business Intelligence)
Módulo estratégico para análise histórica.

Filtros: Hoje, Semana, Mês, Todo Período.

Visualização:

Gráfico de Área (Tendência de Produção).

Gráfico de Pizza (Aprovados vs Reprovados).

Ranking de Técnicos (Barras Horizontais).

Exportação: Botão para gerar Excel (.xlsx) com abas separadas e Impressão PDF.

🛠️ 3.5. Gestão de Equipe
CRUD completo de funcionários.

Soft Delete: Funcionários não são apagados, apenas arquivados (mantendo histórico de produção).

Metadados: Cálculo automático de "Total de Montagens" e "Tempo Médio" por técnico exibido no card.

📦 3.6. Controle de Estoque
Listagem avançada de produtos finalizados.

Visual: Cards responsivos com Badges de status (OK, AVARIA).

Busca: Filtro global por Chassi, Modelo ou Cor.

4. UX/UI e Quality of Life (QoL)
Tema Híbrido: Suporte nativo a Dark Mode e Light Mode com transições suaves (0.5s) em todos os elementos.

Navegação:

Sidebar Retrátil (Desktop).

Menu Sheet/Hambúrguer (Mobile).

Header Inteligente com Avatar e Menu de Usuário.

Scrollbar: Customizada para harmonia visual.

5. Limitações Conhecidas (Motivadores para V2.0)
Apesar de funcional, a versão 1.5 possui pontos que impedem a escala corporativa, que serão resolvidos na V2.0:

Segurança Crítica: As senhas estão salvas sem criptografia (texto puro) e a sessão é baseada em localStorage, vulnerável a ataques.

Fluxo Rígido: O fluxo atual é Scanner -> Montagem -> Estoque. A realidade da fábrica exige etapas intermediárias (Ex: Qualidade 1, Teste de Rolo, Qualidade Final).

Roles Estáticas: As permissões são verificadas apenas no Front-end (RoleGuard), sem proteção no nível do Banco de Dados (RLS).