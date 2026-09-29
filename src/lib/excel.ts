// Exportação para Excel (exceljs carregado só quando alguém exporta).

export interface AbaPlanilha {
  nome: string;
  colunas: { header: string; key: string; width?: number }[];
  linhas: Record<string, unknown>[];
}

export async function baixarPlanilha(nomeArquivo: string, abas: AbaPlanilha[]) {
  const { default: ExcelJS } = await import("exceljs");
  const livro = new ExcelJS.Workbook();
  livro.creator = "SGM";
  for (const aba of abas) {
    const planilha = livro.addWorksheet(aba.nome.slice(0, 31));
    planilha.columns = aba.colunas;
    const cabecalho = planilha.getRow(1);
    cabecalho.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cabecalho.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB91C1C" } };
    aba.linhas.forEach((l) => planilha.addRow(l));
    planilha.views = [{ state: "frozen", ySplit: 1 }];
  }
  const buffer = await livro.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo.endsWith(".xlsx") ? nomeArquivo : `${nomeArquivo}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
