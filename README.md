# SGM - Sistema de Gestão de Montagem (Shineray By Sabel)

![Versão](https://img.shields.io/badge/Versão-2.0.0-red)
![Stack](https://img.shields.io/badge/Stack-Next.js_16_|_Supabase-black)

Sistema web para a linha de montagem de motocicletas: entrada do chassi, montagem, qualidade, avarias,
etiquetagem, estoque e expedição — com perfis de acesso, auditoria e funcionamento em tablets.

## 🆕 Novidades da V2

* **Perfis de acesso (RBAC):** perfis configuráveis na tela *Perfis de acesso*, com permissões por tela e por ação.
  As mesmas regras são conferidas pelo banco de dados (RLS), não só pelo aplicativo. Detalhes em [`docs/rbac.md`](docs/rbac.md).
* **Login pelo Supabase Auth:** senhas guardadas só como hash; montadores continuam com matrícula + PIN;
  senha provisória com troca obrigatória; sessão de até 12 h por dispositivo; conta arquivada perde o acesso na hora.
* **Prontuário do chassi:** linha do tempo completa de cada moto (entrada, montagem, pausas, qualidade, avarias,
  fotos, etiquetas, inventários e expedição), com impressão.
* **Busca rápida (Ctrl+K):** digite ou bipe o chassi (ou só o final dele) em qualquer tela.
* **Inventário do pátio:** contagem por leitura em vários tablets ao mesmo tempo, pendências ao vivo, faltas e
  sobras no fechamento e exportação para Excel.
* **Fotos nas avarias e na qualidade:** câmera do tablet/celular, compressão automática e armazenamento privado
  (Supabase Storage, links temporários).
* **Central de notificações:** pedidos de pausa, retrabalhos, avarias, reparos e divergências de inventário no sino
  (tempo real quando disponível).
* **Padrão visual "linha de montagem":** o menu segue o caminho da moto com as estações **E1 Entrada → E2 Montagem →
  E3 Qualidade → E4 Etiquetagem → E5 Estoque** (desvios AV Avarias e IN Inventário) e mostra quantas motos há em cada uma;
  lâmpadas de sinalização (Andon), placa do chassi com os 4 dígitos finais em destaque, modo guia com dicas em cada tela,
  tema claro/escuro e telas pensadas para tablet. Detalhes em [`docs/identidade-visual.md`](docs/identidade-visual.md).
* **Equipe:** cadastro e redefinição de acesso pelo servidor, último acesso de cada pessoa e desempenho dos últimos 90 dias.
* **Montagem:** horários pelo relógio do servidor, tempo de pausa registrado (início e fim) e cores salvas na hora.

Para migrar uma instalação da V1, siga [`docs/implantacao-v2.md`](docs/implantacao-v2.md).

## 🚀 Módulos

* **Central da linha:** mapa do fluxo E1→E5 com a quantidade e o estado de cada estação, produção do dia contra a meta,
  quadro Andon de alertas, montagens em andamento, fila de inspeção e diário de bordo.
* **Entrada:** leitura de caixas (leitor USB/Bluetooth ou câmera) com identificação automática do modelo.
* **Montagem:** fila, retrabalhos prioritários, cronômetro, checklist configurável, pedido de pausa.
* **Qualidade (QA):** aprovar, devolver para retrabalho ou segregar para avaria, com fotos.
* **Avarias:** pátio com fotos, registro de reparo e histórico dos últimos 30 dias.
* **Etiquetagem:** editor visual de etiquetas, impressão em lote e conferência por leitura.
* **Estoque:** matriz modelo × cor (cada célula filtra a lista), reimpressão, correções, reversão e expedição.
* **Inventário, Prontuário, Relatórios, Equipe, Perfis de acesso, Auditoria e Configurações.**

## 🛠️ Stack Tecnológica

* **Frontend:** [Next.js 16](https://nextjs.org/) (App Router), React 19, TypeScript.
* **Estilização:** [Tailwind CSS](https://tailwindcss.com/) + [Shadcn/ui](https://ui.shadcn.com/).
* **Backend & Database:** [Supabase](https://supabase.com/) (PostgreSQL com RLS, Auth, Realtime, Storage).
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

3.  **Configure as Variáveis de Ambiente** (modelo em [`.env.example`](.env.example)):
    Crie um arquivo `.env.local` na raiz:
    ```env
    NEXT_PUBLIC_SUPABASE_URL=sua_url_supabase
    NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anonima
    # Somente no servidor (nunca com prefixo NEXT_PUBLIC_): usada pela tela Equipe
    SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role
    ```

4.  **Banco de dados:** aplique as migrações de `supabase/migrations/` na ordem descrita em
    [`docs/implantacao-v2.md`](docs/implantacao-v2.md) (fase 1, script de usuários, fase 4 e, por fim, fase 5).
    Para um ambiente de teste do zero há uma estrutura de exemplo em [`docs/teste/esquema-base-v1.sql`](docs/teste/esquema-base-v1.sql).

5.  **Rode o projeto:**
    ```bash
    npm run dev
    ```

## 🖨️ Etiquetas e Impressora (BY-480BT)

Em **Etiquetagem → Layout das etiquetas** (permissão "Editar layout de etiquetas") é possível:

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

| Perfil padrão | Acesso | Resumo |
|---------------|--------|--------|
| **Master** | Senha | Acesso total, inclusive perfis de acesso |
| **Gestor** | Senha | Central da linha, estoque, relatórios, equipe, auditoria e configurações |
| **Supervisor** | Senha | Qualidade, pausas, avarias, etiquetagem, estoque e inventário |
| **Montador** | Matrícula + PIN | Montagem, entrada e etiquetagem |

Perfis novos podem ser criados na tela **Perfis de acesso**. Lista completa de permissões e regras em [`docs/rbac.md`](docs/rbac.md).

## 🛡️ Segurança

* Login pelo Supabase Auth (senhas somente em hash) e regras de acesso no banco (RLS) por permissão.
* Cadastro de pessoas e senhas apenas pelo servidor (`/api/admin/*`, com a chave service_role).
* Auditoria com autor e horário definidos pelo servidor; registros não podem ser alterados nem apagados.
* Fotos em bucket privado com links temporários; respostas do Supabase nunca vão para o cache do PWA.
* Relatório da revisão anterior: [`docs/revisao-2026-09.md`](docs/revisao-2026-09.md).

## 📝 Licença

Proprietário: **Shineray By Sabel**. Uso interno restrito.
