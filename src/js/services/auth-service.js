import { assertStrongPassword } from "../models/password-policy.js";
import { isValidCpf, normalizeCpf } from "../models/cpf.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Autenticação contra o servidor Python. As validações daqui são só para
 * feedback rápido na tela — o servidor repete todas elas e é quem decide.
 */
export class AuthService {
  constructor(authRepository) { this.authRepository = authRepository; }

  /** { authenticated, needsSetup, profile?, pendingSignupRequests? } */
  async getSession() { return this.authRepository.getSession(); }

  async signIn(email, password) {
    if (!String(email ?? "").trim() || !password) throw new Error("Informe e-mail e senha.");
    return this.authRepository.signIn({ email: String(email).trim(), password });
  }

  validateRegistration({ name, email, cpf, password, passwordConfirm, jobTitle }) {
    const cleanName = String(name ?? "").trim().replace(/\s+/g, " ");
    const cleanEmail = String(email ?? "").trim().toLowerCase();
    if (cleanName.length < 3) throw new Error("Informe o nome completo.");
    if (!EMAIL_RE.test(cleanEmail)) throw new Error("Informe um e-mail válido.");
    if (!isValidCpf(cpf)) throw new Error("Informe um CPF válido.");
    if (!jobTitle) throw new Error("Selecione o cargo.");
    assertStrongPassword(password, { name: cleanName, email: cleanEmail });
    if (password !== passwordConfirm) throw new Error("As senhas não coincidem.");
    return { name: cleanName, email: cleanEmail, cpf: normalizeCpf(cpf), password, jobTitle };
  }

  /** Cria o primeiro usuário (MASTER). Só funciona enquanto não existe nenhum usuário. */
  async setupMaster(values) { return this.authRepository.setupMaster(this.validateRegistration(values)); }

  /** Envia uma solicitação de acesso; o MASTER aprova ou recusa em Usuários. */
  async requestAccess(values) { return this.authRepository.requestAccess(this.validateRegistration(values)); }

  async changePassword({ currentPassword, password, passwordConfirm }, profile) {
    if (!currentPassword) throw new Error("Informe a senha atual.");
    assertStrongPassword(password, { name: profile?.name, email: profile?.email });
    if (password !== passwordConfirm) throw new Error("As senhas não coincidem.");
    if (password === currentPassword) throw new Error("A nova senha deve ser diferente da atual.");
    return this.authRepository.changePassword(currentPassword, password);
  }

  async signOut() { return this.authRepository.signOut(); }
}
