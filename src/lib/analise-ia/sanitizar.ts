const RE_CPF_FORMATADO = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const RE_CPF_LABEL = /\bCPF[:\s]*\d{11}\b/gi;
const RE_CNPJ_FORMATADO = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;
const RE_CNPJ_LABEL = /\bCNPJ[:\s]*\d{14}\b/gi;
const RE_EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const RE_TEL_FORMATADO = /\(\d{2}\)\s?\d{4,5}-\d{4}/g;
const RE_TEL_SIMPLES = /\b\d{2}\s?9?\d{4}[-\s]\d{4}\b/g;

export function sanitizarParaIA(texto: string): string {
  return texto
    .replace(RE_CPF_FORMATADO, '[CPF]')
    .replace(RE_CPF_LABEL, 'CPF [CPF]')
    .replace(RE_CNPJ_FORMATADO, '[CNPJ]')
    .replace(RE_CNPJ_LABEL, 'CNPJ [CNPJ]')
    .replace(RE_EMAIL, '[EMAIL]')
    .replace(RE_TEL_FORMATADO, '[TELEFONE]')
    .replace(RE_TEL_SIMPLES, '[TELEFONE]');
}
