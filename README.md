# SGM - Sistema de Gestão de Montagem (Shineray By Sabel)

![Status](https://img.shields.io/badge/Status-Produção-green)
![Version](https://img.shields.io/badge/Versão-2.0.0-blue)
![Stack](https://img.shields.io/badge/Stack-Next.js_16_|_Supabase-black)

Sistema web completo para controle de linha de montagem de motocicletas, abrangendo desde a entrada do chassi até a expedição, com controle rigoroso de qualidade, gestão de avarias e etiquetagem térmica.

## 🚀 Funcionalidades Principais

* **Torre de Controle (Dashboard):** Fluxo completo em tempo real (fila de entrada, montagem, pausas, inspeção, avarias, etiquetagem e estoque), meta diária configurável sobre montagens finalizadas, tempo ao vivo de cada box, alertas automáticos (montagem atrasada, pausa longa, fila de inspeção, avarias) e feed de atividade.
* **Linha de Montagem Digital:** Cronometragem automática, checklist configurável, solicitação de pausa com motivo (cancelável), proteção contra dois montadores assumirem a mesma caixa.
* **Controle de Qualidade (QA):** Fluxo de aprovação, retrabalho (volta pra linha) ou segregação (vai para oficina), com tempo de espera da fila.
* **Gestão de Avarias:** Histórico imutável de defeitos e reparos ("Prontuário da Moto") e painel de reparos concluídos.
* **Etiquetagem Personalizável:** Editor visual de modelos de etiqueta (tamanho, blocos, fontes, código de barras/QR Code, campos, logo, calibração da impressora), impressão em lote e conferência por leitura do código de barras. Compatível com impressoras térmicas como a BY-480BT.
* **Estoque & Expedição:** Inventário com filtros, exportação CSV, reimpressão de etiqueta e baixa de saída.
* **Configurações do Sistema:** Meta diária, limites de alerta, checklist, catálogos de cores e novos modelos (código VDS) sem precisar atualizar o sistema.
* **Auditoria:** Rastreabilidade completa (logins, falhas de login, entradas, pausas, QA, etiquetas, configurações, equipe) com filtros e exportação.

## 🛠️ Stack Tecnológica

* **Frontend:** [Next.js 16](https://nextjs.org/) (App Router), React 19, TypeScript.
* **Estilização:** [Tailwind CSS](https://tailwindcss.com/) + [Shadcn/ui](https://ui.shadcn.com/).
* **Backend & Database:** [Supabase](https://supabase.com/) (PostgreSQL, Auth, Realtime).
* **Bibliotecas Chave:**
    * `recharts`: Gráficos e BI.
    * `jsbarcode`: Códigos de barras (Code128/Code39) gerados localmente, sem CDN.
    * `@zxing/library`: Leitura por câmera e geração de QR Code.
    * `lucide-react`: Ícones.
    * `sonner`: Notificações (Toasts).

## ⚙️ Pré-requisitos e Instalação

1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/shiadmti-bot/sgm-shineray.git
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

4.  **Crie a tabela de configurações compartilhadas (uma vez):**
    No Supabase, abra o **SQL Editor** e execute o arquivo
    [`supabase/migrations/20260928120000_configuracoes_sistema.sql`](supabase/migrations/20260928120000_configuracoes_sistema.sql).
    Ela guarda o layout das etiquetas, a meta diária, o checklist e os catálogos para **todas as estações**.
    Sem ela o sistema continua funcionando, mas essas configurações ficam salvas só no navegador de cada dispositivo (a tela de Configurações avisa quando isso acontece).

5.  **Rode o projeto:**
    ```bash
    npm run dev
    ```

## 🖨️ Etiquetas e Impressora (BY-480BT)

Em **Etiquetagem → Layout das etiquetas** (gestor/master) é possível:

* Criar, duplicar, importar/exportar (JSON) e excluir modelos; definir o **modelo padrão**.
* Definir tamanho do papel (predefinições 100×150, 100×100, 100×50, 70×50, 60×40, 50×30 mm ou personalizado), margem, bordas, fonte e **cópias por moto**.
* Montar a etiqueta com blocos reordenáveis: cabeçalho, modelo, cores, código de barras, QR Code, chassi (com destaque dos dígitos finais), lista de campos, texto livre, imagem/logo e espaço.
* Usar variáveis nos textos: `{chassi}`, `{chassi_final}`, `{modelo}`, `{cor}`, `{cor_banco}`, `{ano}`, `{montador}`, `{supervisor}`, `{localizacao}`, `{data}`, `{hora}`.
* Corrigir impressões deslocadas com o **ajuste horizontal/vertical** e conferir tudo na pré-visualização (é o mesmo HTML que vai para a impressora) ou com **Imprimir teste**.

Vêm prontos dois modelos: **Etiqueta de Caixa (100×150 mm)** — idêntica à etiqueta usada até a v2.0 — e **Etiqueta Sub-banco (70×50 mm)**.

No driver da impressora (Windows), cadastre um tamanho de papel para cada modelo usado, por exemplo:
1.  **Padrão:** 100mm (Largura) x 150mm (Altura).
2.  **Moto_Sub_Banco:** 70mm (Largura) x 50mm (Altura).

> **Nota:** Configure a impressão como "Retrato" no driver e margens zero no navegador. As cores de fundo (cabeçalho preto) já são forçadas na impressão.

**Fluxo na estação:** bipe o chassi da caixa (com "Imprimir ao bipar" ligado a etiqueta sai na hora) ou selecione várias motos e use **Imprimir selecionadas**. Em seguida, bipe o código de barras de cada etiqueta impressa (ou digite os 4 últimos dígitos) para conferir e enviar ao estoque.

## 🔐 Perfis de Acesso (RBAC)

* **Master:** Acesso total. Só um Master pode criar/alterar contas Master.
* **Gestor:** Visão gerencial, relatórios, estoque, equipe, auditoria e configurações.
* **Supervisor:** Controle de qualidade, aprovação de pausas, avarias e estoque.
* **Montador:** Linha de montagem, scanner e etiquetagem.

Sessões expiram em 12 horas; colaboradores arquivados perdem o acesso em até 5 minutos.

## 🧪 Ferramenta de desenvolvimento (`/seed`)

A página `/seed` **apaga o banco** e recria usuários de teste. Ela só existe quando a variável de servidor `SGM_HABILITAR_SEED=true` está definida — **nunca** a habilite em produção.

## 🛡️ Segurança

Veja [`docs/revisao-2026-09.md`](docs/revisao-2026-09.md) para o relatório da revisão geral, o que foi corrigido e as recomendações que dependem de mudanças no banco (Supabase Auth, senhas com hash e políticas RLS por cargo).

## 📝 Licença

Proprietário: **Shineray By Sabel**. Uso interno restrito.
