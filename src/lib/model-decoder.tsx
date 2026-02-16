// src/lib/model-decoder.ts

// Mapeamento extraído do arquivo motos_import.csv
// A chave é o VDS (caracteres da posição 3 a 8 do chassi)
const VDS_MAP: Record<string, string> = {
  // Novos Modelos 2026
  NJ1125: "JET 125 2026",
  SHF195: "SHI 175 EFI 2026", // Adicionado conforme solicitação

  // Modelos Existentes
  JTS050: "JET 50 (S)",
  PHS050: "PHOENIX 50 (S)",
  ATV200: "QUADRICICLO ATV 200",
  SCE350: "SCOOTER PT1",
  PT2100: "SCOOTER PT2",
  PT2800: "SCOOTER PT2X S",
  PT3200: "SCOOTER PT3",
  P4S300: "SCOOTER PT4",
  SHE3K1: "SHE3000",
  SHT175: "SHI 175 (RS/SS)",
  SHF175: "SHI 175 EFI",
  JTS125: "JET 125 (RS/SS)",
  JTF125: "JET 125 SS EFI",
  R1F125: "RIO 125 EFI",
  R1C125: "RIO 125",
  JF1150: "JEF 150 S",
  JFF150: "JEF 150 S EFI",
  JF2150: "JEF 150s EFI 2026",
  URF150: "URBAN 150 EFI",
  FRF150: "FREE 150 EFI",
  SHF250: "SHI 250 EFI",
  KC2200: "KART CROSS 200 S",
  FLF250: "FLASH 250 EFI",
  TTF250: "TITANIUM EFI",
  DVF250: "DENVER EFI",
  ARF250: "IRON EFI",
  STF200: "STORM 200",
  DRF012: "DRIFT 01",
  PTXR20: "PTXR",
  SH3800: "SCOOTER SH3",
  KTR150: "TRICICLO SOUZA",
  SH4800: "SCOOTER SH-4",
  CR150R: "SOUZA CROSS",
  SB1400: "SBM 400",
  SB1250: "SBM 250",
  SBT600: "SBM 600",
  SF1150: "SBM 150",
};

export function identificarModelo(codigo: string): string {
  if (!codigo || codigo.length < 9) return "Modelo Desconhecido";

  // Tenta identificar pelo padrão VDS (Shineray começa com 99H...)
  // Normaliza para maiúsculo
  const upperCode = codigo.toUpperCase();

  // Extrai o VDS. Normalmente posições 3 a 8 (0-based) se for VIN completo
  // Ex: 99H[NJ1125]TS... -> NJ1125
  // Se o código for menor que 17 caracteres, tenta pegar os 6 primeiros ou o próprio código
  let vds = "";
  if (upperCode.length === 17) {
    vds = upperCode.substring(3, 9);
  } else if (upperCode.length >= 6) {
    // Assume que pode ser apenas o VDS
    vds = upperCode.substring(0, 6);
  }

  if (VDS_MAP[vds]) {
    return VDS_MAP[vds];
  }

  // Tenta decodificar genericamente se não encontrar no mapa
  return decodificarGenerico(vds) || "Modelo Desconhecido";
}

function decodificarGenerico(vds: string): string | null {
  if (!vds || vds.length < 6) return null;

  // Padrões Comuns Shineray
  const prefixo = vds.substring(0, 3); // Ex: SH, JT, PH
  const sufixo = vds.substring(3); // Ex: F175, S050, E3K1

  let familia = "";
  if (prefixo.startsWith("SH")) familia = "SHI";
  else if (prefixo.startsWith("JT")) familia = "JET";
  else if (prefixo.startsWith("PH")) familia = "PHOENIX";
  else if (prefixo.startsWith("XY")) familia = "SHINERAY XY";
  else if (prefixo.startsWith("JF")) familia = "JEF";
  else if (prefixo.startsWith("UR")) familia = "URBAN";
  else if (prefixo.startsWith("FR")) familia = "FREE";
  else if (prefixo.startsWith("TT")) familia = "TITANIUM";
  else if (prefixo.startsWith("DV")) familia = "DENVER";
  else if (prefixo.startsWith("AR")) familia = "IRON";
  else if (prefixo.startsWith("ST")) familia = "STORM";
  else if (prefixo.startsWith("DR")) familia = "DRIFT";
  else if (prefixo.startsWith("PT")) familia = "SCOOTER PT";

  if (!familia) return null;

  // Tentar extrair cilindrada
  const cilindradaMatch = vds.match(/\d+/);
  const cilindrada = cilindradaMatch ? cilindradaMatch[0] : "";

  // Tentar identificar características
  let extra = "";
  if (vds.includes("F")) extra += " EFI";
  if (vds.includes("S")) extra += " S";
  if (vds.includes("E")) extra += " Electric";

  const modeloEstimado = `${familia} ${cilindrada}${extra} (Detectado Auto)`;

  return modeloEstimado.trim();
}
