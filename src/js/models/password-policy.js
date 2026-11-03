// Política de senha forte — espelho de backend/security.py (password_policy_errors).
// Aqui serve para dar feedback imediato na tela; quem decide é sempre o servidor.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const fold = (value) => String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const SPECIAL = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

/** Requisitos exibidos como checklist no formulário. */
export function passwordChecklist(password = "") {
  return [
    { id: "length", label: `Mínimo de ${PASSWORD_MIN_LENGTH} caracteres`, ok: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH },
    { id: "upper", label: "Uma letra maiúscula", ok: /[A-Z]/.test(password) },
    { id: "lower", label: "Uma letra minúscula", ok: /[a-z]/.test(password) },
    { id: "digit", label: "Um número", ok: /[0-9]/.test(password) },
    { id: "special", label: "Um caractere especial (! @ # $ % …)", ok: SPECIAL.test(password) },
    { id: "spaces", label: "Sem espaços e sem 3 caracteres iguais seguidos", ok: password.length > 0 && !/\s/.test(password) && !/(.)\1\1/.test(password) },
  ];
}

export function passwordPolicyErrors(password, { name = "", email = "" } = {}) {
  const value = String(password ?? "");
  const errors = passwordChecklist(value).filter((rule) => !rule.ok).map((rule) => rule.label);
  const lowered = fold(value);
  const fragments = fold(name).split(/\s+/).filter((part) => part.length >= 4);
  const local = fold(email).split("@")[0];
  if (local.length >= 4) fragments.push(local);
  if (fragments.some((fragment) => lowered.includes(fragment))) errors.push("Não pode conter seu nome ou e-mail");
  return errors;
}

export function assertStrongPassword(password, context = {}) {
  const errors = passwordPolicyErrors(password, context);
  if (errors.length) throw new Error(`A senha não atende aos requisitos: ${errors.join("; ")}.`);
}
