# SGM - Sistema de Gestão de Montagem (Shineray By Sabel)

![Status](https://img.shields.io/badge/Status-Produção-green)
![Version](https://img.shields.io/badge/Versão-2.0.0-blue)
![Stack](https://img.shields.io/badge/Stack-Next.js_14_|_Supabase-black)

Sistema web completo para controle de linha de montagem de motocicletas, abrangendo desde a entrada do chassi até a expedição, com controle rigoroso de qualidade, gestão de avarias e etiquetagem térmica.

## 🚀 Funcionalidades Principais

* **Torre de Controle (Dashboard):** Monitoramento em tempo real da produção, gargalos e metas.
* **Linha de Montagem Digital:** Cronometragem automática, checklists de segurança e solicitações de pausa.
* **Controle de Qualidade (QA):** Fluxo de aprovação, retrabalho (volta pra linha) ou segregação (vai para oficina).
* **Gestão de Avarias:** Histórico imutável de defeitos e reparos ("Prontuário da Moto").
* **Etiquetagem Integrada:** Geração de etiquetas térmicas (100x150mm e 70x50mm) compatíveis com impressoras BY-480BT.
* **Estoque & Expedição:** Controle de inventário final com filtros avançados e baixa de saída.
* **Auditoria:** Rastreabilidade completa de ações (Logs do Sistema).

## 🛠️ Stack Tecnológica

* **Frontend:** [Next.js 14](https://nextjs.org/) (App Router), React, TypeScript.
* **Estilização:** [Tailwind CSS](https://tailwindcss.com/) + [Shadcn/ui](https://ui.shadcn.com/).
* **Backend & Database:** [Supabase](https://supabase.com/) (PostgreSQL, Auth, Realtime).
* **Bibliotecas Chave:**
    * `recharts`: Gráficos e BI.
    * `jsbarcode`: Geração de códigos de barras (Code128).
    * `lucide-react`: Ícones.
    * `sonner`: Notificações (Toasts).

## ⚙️ Pré-requisitos e Instalação

1.  **Clone o repositório:**
    ```bash
    git clone [https://github.com/seu-usuario/sgm-shineray.git](https://github.com/seu-usuario/sgm-shineray.git)
    cd sgm-shineray
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Configure as Variáveis de Ambiente:**
    Crie um arquivo `.env.local` na raiz:
    ```env
    NEXT_PUBLIC_SUPABASE_URL=sua_url_supabase
    NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anonima
    ```

4.  **Rode o projeto:**
    ```bash
    npm run dev
    ```

## 🖨️ Configuração de Impressora (BY-480BT)

Para o funcionamento correto da etiquetagem, o driver da impressora no Windows deve ter dois tamanhos de papel configurados:
1.  **Padrão:** 100mm (Largura) x 150mm (Altura).
2.  **Moto_Sub_Banco:** 70mm (Largura) x 50mm (Altura).

> **Nota:** Sempre configure a impressão como "Retrato" no driver e remova as margens no navegador.

## 🔐 Perfis de Acesso (RBAC)

* **Master:** Acesso total (incluindo Auditoria e Gestão de Técnicos).
* **Gestor:** Visão gerencial, relatórios e controle de estoque.
* **Supervisor:** Controle de qualidade, aprovação de pausas e gestão de pátio.
* **Montador:** Acesso restrito à tela de montagem e scanner.

## 📝 Licença

Proprietário: **Shineray By Sabel**. Uso interno restrito.