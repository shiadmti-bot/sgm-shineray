# Identidade visual — padrão "linha de montagem"

Guia para quem mantém o SGM. A interface imita o chão de fábrica: estações numeradas, painéis de instrumento,
lâmpadas de sinalização (Andon) e a placa do chassi. O objetivo é ser **sério e legível** para quem trabalha na
linha e **didático** para quem está chegando.

## Princípios

1. **O fluxo é o mapa.** Toda tela da linha tem um código de estação e o menu segue o caminho da moto:
   `E1 Entrada → E2 Montagem → E3 Qualidade → E4 Etiquetagem → E5 Estoque`. Desvios têm borda tracejada:
   `AV Avarias` (sai da E3 e volta para a E3 após o reparo) e `IN Inventário`. Na Central aparecem ainda
   `RT Retrabalho` (volta da E3 para a E2) e `EXP Expedição`.
2. **Cor sinaliza estado, nunca decora.** Verde/amarelo/laranja/vermelho são reservados para sinalização e
   aparecem sempre com texto ou ícone ao lado. Texto fica na tinta do tema (preto/branco), nunca na cor do dado.
3. **Vermelho Shineray é marca e ação principal** (botão primário, item ativo do menu, dígitos finais do chassi).
   Não é usado como cor de dado.
4. **Ensinar sem atrapalhar.** O *modo guia* (botão **Guia** no topo, ligado por padrão, escolha salva por
   dispositivo) mostra dicas curtas; estados vazios dizem o que aparece ali e como fazer aparecer.

## Tokens (src/app/globals.css)

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--background` | `#F1F1EE` | `#0D0D0D` | fundo "concreto" com malha técnica (`.fundo-tecnico`) |
| `--card` | `#FCFCFB` | `#1A1A19` | painéis |
| `--painel-cabecalho` | `#F6F6F4` | `#1F1F1F` | faixa de título dos painéis |
| `--primary` | `#C8102E` | `#DC3545` | marca / ação principal |
| `--sidebar` | `#121315` | `#0A0A0B` | menu "Estações" (grafite nos dois temas) |
| `--success` | `#0CA30C` | igual | lâmpada **normal/bom** |
| `--warning` | `#FAB219` | igual | lâmpada **atenção** |
| `--serio` | `#EC835A` | igual | **retrabalho** / sério |
| `--destructive` | `#D03B3B` | igual | lâmpada **crítico** |
| `--info` | `#2A78D6` | `#3987E5` | **em processo** |
| `--etapa-1…5` | `#86B6EF → #104281` | invertida | etapa da moto no fluxo (rampa de um só matiz) |

A rampa de etapas foi validada como ordinal (claro e escuro) com o script da skill de visualização.

## Tipografia (src/app/layout.tsx)

- **Barlow** — texto e números.
- **Barlow Condensed** — só rótulos técnicos em caixa alta (`.rotulo`).
- **IBM Plex Mono** — chassi, códigos de estação, horários e cronômetros.

## Componentes

| Componente | Arquivo | Quando usar |
|---|---|---|
| `Painel` | `components/sgm/Painel.tsx` | Moldura padrão: faixa de título + código da estação + ações. Substitui os "cards". |
| `StatCard` | `components/sgm/StatCard.tsx` | Leitura de instrumento (rótulo, lâmpada, valor). `destacar` acende a faixa superior. |
| `Led` / `Selo` | `components/sgm/Led.tsx`, `Selo.tsx` | Lâmpada Andon; selo = lâmpada + texto. |
| `PlacaChassi` | `components/sgm/PlacaChassi.tsx` | VIN dividido em WMI/VDS/VIS, 4 dígitos finais destacados; `explicar` ensina as partes. |
| `MedidorSegmentado` / `MedidorLinear` | `components/sgm/Medidor.tsx` | Meta (1 segmento = 1 unidade) e tempo contra referência. |
| `Dica` / `useModoGuia` | `components/sgm/Guia.tsx` | Dicas do modo guia. |
| `EmptyState` | `components/sgm/EmptyState.tsx` | Estado vazio com passos numerados. |
| `SeletorCor` | `components/sgm/SeletorCor.tsx` | Escolha de cor por amostra (toque direto no tablet). |
| `MapaFluxo`, `ProducaoHoje`, `EstadoLinha`… | `components/central/` | Peças da Central da linha. |
| `MatrizPatio` | `components/estoque/MatrizPatio.tsx` | Matriz modelo × cor do estoque (cada célula filtra a lista). |

## Gráficos (src/lib/cores-graficos.ts)

- Desfecho das motos, **nesta ordem de empilhamento**: aprovada `#008300` → retrabalho `#EDA100` (escuro `#C98500`)
  → em andamento `#2A78D6` (`#3987E5`) → avaria `#E34948` (`#E66767`). Validado para daltonismo nos dois temas;
  no escuro o par verde/amarelo fica na faixa de atenção, por isso há separação de 2 px entre segmentos, legenda e dica.
- Série única: azul. Segunda série: amarelo (com rótulos, porque o amarelo tem pouco contraste no claro).
- Um eixo por gráfico. Medidas diferentes (ex.: quantidade e minutos) vão lado a lado, cada uma na sua escala.
- Sem gráfico de pizza: rankings em barras finas com o número ao lado.
- Categorias que se sobrepõem (uma moto aprovada que teve retrabalho) não são empilhadas — vão para tabela.

## Acessibilidade

- Estado nunca só por cor: toda lâmpada tem texto ou ícone ao lado; estações têm `aria-label` completo.
- Animações (esteira, lâmpada piscando) respeitam `prefers-reduced-motion`.
- Contrastes conferidos: vermelho da marca `#C8102E` 5,7:1 sobre o painel; texto branco sobre ele 5,9:1;
  tinta secundária `#52514E` e `#75746E` acima de 4,5:1 no claro; `#C3C2B7` e `#9A9990` no escuro.
- Alvos de toque de 44 px ou mais nas telas da linha (tablets).
