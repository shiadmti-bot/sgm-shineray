# SGM - Sistema de Gestão de Montagem Shineray

Sistema web progressivo (PWA) desenvolvido para otimizar a linha de montagem de motocicletas, garantindo rastreabilidade desde a entrada da caixa até a expedição, com controle de qualidade digital e métricas de tempo em tempo real.

## 🚀 Tecnologias Utilizadas

* **Frontend:** Next.js 14 (App Router), React, TypeScript.
* **Estilização:** Tailwind CSS.
* **UI Kit:** shadcn/ui (Radix UI).
* **Backend/Banco de Dados:** Supabase (PostgreSQL).
* **Leitura de Dados:** react-zxing (Barcode Scanner).
* **Ícones:** Lucide React.

## 🛠️ Funcionalidades

1.  **Entrada Inteligente:**
    * Leitura de código de barras (Code 128) via câmera do dispositivo.
    * Registro automático de SKU e Modelo no sistema.
2.  **Linha de Montagem Digital:**
    * Fila de produção em tempo real (FIFO).
    * Cronômetro individual por moto para medição de KPI de eficiência.
3.  **Quality Gate (Controle de Qualidade):**
    * Checklist obrigatório para liberação de produto.
    * Bloqueio de aprovação em caso de itens não conformes.
    * Registro de reprovas e devolução para retrabalho.
4.  **Gestão de Estoque:**
    * Visão geral de produtos prontos, reservados e expedidos.
    * Filtros dinâmicos e indicadores de performance.

## 📦 Como Rodar Localmente

1.  Clone o repositório.
2.  Instale as dependências:
    ```bash
    npm install
    ```
3.  Configure as variáveis de ambiente `.env.local` com suas chaves do Supabase:
    ```env
    NEXT_PUBLIC_SUPABASE_URL=sua_url
    NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave
    ```
4.  Rode o servidor de desenvolvimento:
    ```bash
    npm run dev --webpack
    ```