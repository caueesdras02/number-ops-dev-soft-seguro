// Validação de CPF (dígitos verificadores) — espelho de backend/security.py (is_valid_cpf).
export const normalizeCpf = (value) => String(value ?? "").replace(/\D/g, "");

export function isValidCpf(value) {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const size of [9, 10]) {
    let total = 0;
    for (let i = 0; i < size; i += 1) total += Number(cpf[i]) * (size + 1 - i);
    const digit = (total * 10) % 11 % 10;
    if (digit !== Number(cpf[size])) return false;
  }
  return true;
}

/** Máscara de digitação: 000.000.000-00 */
export function formatCpfInput(value) {
  const digits = normalizeCpf(value).slice(0, 11);
  return digits.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
}
