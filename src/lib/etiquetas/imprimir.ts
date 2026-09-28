// Impressão por iframe oculto: não é barrado por bloqueador de pop-up, não depende de CDN
// e mantém a tela atual aberta para a confirmação da etiqueta.

const ID_IFRAME = "sgm-iframe-impressao";

function obterIframe(): HTMLIFrameElement {
  let iframe = document.getElementById(ID_IFRAME) as HTMLIFrameElement | null;
  if (!iframe) {
    iframe = document.createElement("iframe");
    iframe.id = ID_IFRAME;
    iframe.title = "Impressão de etiquetas";
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    document.body.appendChild(iframe);
  }
  return iframe;
}

function aguardarImagens(doc: Document): Promise<void> {
  const pendentes = Array.from(doc.images).filter((img) => !img.complete);
  return Promise.all(
    pendentes.map(
      (img) =>
        new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        })
    )
  ).then(() => undefined);
}

/** Abre a caixa de impressão do navegador para o documento HTML informado. */
export async function imprimirHTML(html: string): Promise<void> {
  const iframe = obterIframe();

  await new Promise<void>((resolve) => {
    // Tempo-limite de segurança: a impressão nunca fica presa esperando o carregamento.
    const limite = setTimeout(resolve, 3000);
    iframe.onload = () => {
      clearTimeout(limite);
      resolve();
    };
    // Marca única por trabalho: garante recarga mesmo reimprimindo um documento idêntico.
    iframe.srcdoc = `${html}<!-- trabalho ${Date.now()}-${Math.random().toString(36).slice(2)} -->`;
  });

  const doc = iframe.contentDocument;
  const janela = iframe.contentWindow;
  if (!doc || !janela) throw new Error("Não foi possível preparar a impressão.");

  await aguardarImagens(doc);
  // Pequena folga para o navegador concluir o layout antes de abrir a caixa de impressão.
  await new Promise((r) => setTimeout(r, 120));

  janela.focus();
  janela.print();
}
