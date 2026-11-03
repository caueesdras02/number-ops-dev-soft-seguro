import { escapeHtml } from "./number-presentation.js";
import { passwordChecklist } from "../models/password-policy.js";

const BRAND = "./src/assets/logo-wordmark.svg";
const brandImg = (cls = "") => `<img class="${cls}" src="${BRAND}" alt="Number Ops">`;
const themeToggle = () => `<button type="button" class="theme-toggle auth-theme-toggle" data-theme-toggle aria-pressed="false" aria-label="Alternar tema"><span data-theme-icon aria-hidden="true">☀</span></button>`;
export const authMobileBrand = () => `<div class="auth-mobile-brand">${brandImg()}</div>`;

const authShell = (content) => `<main class="auth-page">${themeToggle()}<section class="auth-layout"><aside class="auth-brand-panel">${brandImg()}<div><p class="eyebrow">Operação conectada</p><h2>Números sob controle.<br>Equipe em sintonia.</h2><p>Uma visão segura e centralizada da operação de números e chips da sua empresa, protegida por autenticação.</p></div><ul><li><span>✓</span> Dados centralizados</li><li><span>✓</span> Acesso por perfil</li><li><span>✓</span> Histórico preservado</li></ul><small>Number Ops</small></aside><section class="auth-card">${content}</section></section></main>`;
const messageBox = (message, tone = "alert") => message ? `<div class="auth-message ${tone === "success" ? "is-success" : ""}" role="${tone === "success" ? "status" : "alert"}">${escapeHtml(message)}</div>` : "";

function passwordField(label, name, { autocomplete = "current-password", placeholder = "Sua senha", withChecklist = false } = {}) {
  return `<label${withChecklist ? ' class="auth-form-wide"' : ""}>${label}<div class="password-field"><input class="input" name="${name}" type="password" autocomplete="${autocomplete}" placeholder="${placeholder}" maxlength="128" required ${withChecklist ? "data-password-strength" : ""}><button type="button" class="password-toggle" data-toggle-password aria-label="Mostrar senha" aria-pressed="false"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><line class="password-toggle-slash" x1="3" y1="3" x2="21" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>${withChecklist ? renderPasswordChecklist("") : ""}</label>`;
}

export function renderPasswordChecklist(password) {
  return `<ul class="password-checklist" data-password-checklist aria-live="polite">${passwordChecklist(password).map((rule) => `<li class="${rule.ok ? "is-ok" : ""}"><span aria-hidden="true">${rule.ok ? "✓" : "•"}</span>${escapeHtml(rule.label)}</li>`).join("")}</ul>`;
}

const jobTitleField = () => `<label>Cargo<select class="input" name="jobTitle" required><option value="">Selecione</option><option value="ANALYST">Analista</option><option value="ACCOUNT_MANAGER">Gerente de Contas</option><option value="OTHER">Outro</option></select></label>`;
const identityFields = () => `<label>Nome<input class="input" name="name" autocomplete="name" placeholder="Nome completo" minlength="3" maxlength="120" required></label><label>E-mail<input class="input" name="email" type="email" autocomplete="email" placeholder="voce@empresa.com" maxlength="254" required></label><label>CPF<input class="input" name="cpf" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00" maxlength="14" required data-cpf-input><small class="form-hint" data-cpf-hint hidden></small></label>${jobTitleField()}${passwordField("Senha", "password", { autocomplete: "new-password", placeholder: "Crie uma senha forte", withChecklist: true })}${passwordField("Confirmar senha", "passwordConfirm", { autocomplete: "new-password", placeholder: "Repita a senha" })}`;

export function renderLogin(message = "", tone = "alert") {
  return authShell(`${authMobileBrand()}<p class="eyebrow">Acesso seguro</p><h1>Bem-vindo ao Number Ops</h1><p class="auth-intro">Centralize e acompanhe a operação dos números em um só lugar.</p>${messageBox(message, tone)}<form data-auth-form="login"><label>E-mail<input class="input" name="email" type="email" autocomplete="email" placeholder="voce@empresa.com" required></label>${passwordField("Senha", "password")}<button class="auth-forgot-link" type="button" data-auth-mode="forgot">Esqueci minha senha</button><button class="button button-primary auth-submit" type="submit">Entrar com segurança <span>→</span></button><button class="button button-quiet" type="button" data-auth-mode="register">Solicitar acesso</button></form><p class="auth-footnote">Após 5 tentativas incorretas, o login fica bloqueado por 15 minutos.</p>`);
}

export function renderRegistration(message = "") {
  return authShell(`${authMobileBrand()}<p class="eyebrow">Novo acesso</p><h1>Solicitar acesso</h1><p class="auth-intro">Preencha seus dados. A solicitação fica pendente até um administrador MASTER aprovar — ele define seu nível de acesso e Squad. Cada CPF só pode ter uma conta ou solicitação pendente.</p>${messageBox(message)}<form data-auth-form="register"><div class="auth-form-grid">${identityFields()}</div><button class="button button-primary auth-submit" type="submit">Enviar solicitação <span>→</span></button><button class="button button-quiet" type="button" data-auth-mode="login">Voltar ao login</button></form>`);
}

export function renderSetup(message = "") {
  return authShell(`${authMobileBrand()}<p class="eyebrow">Primeiro acesso</p><h1>Configurar o Number Ops</h1><p class="auth-intro">Nenhum usuário existe ainda. Crie a conta <strong>MASTER</strong>: ela aprova as solicitações de acesso e gerencia todo o sistema.</p>${messageBox(message)}<form data-auth-form="setup"><div class="auth-form-grid">${identityFields()}</div><button class="button button-primary auth-submit" type="submit">Criar conta MASTER <span>→</span></button></form>`);
}

export function renderForgotPassword() {
  return authShell(`${authMobileBrand()}<p class="eyebrow">Recuperar acesso</p><h1>Esqueci minha senha</h1><p class="auth-intro">Por segurança, o Number Ops não envia senhas por e-mail. Peça a um administrador <strong>MASTER</strong> para redefinir seu acesso em <em>Usuários → Redefinir senha</em>. Você receberá uma senha temporária e precisará criar uma nova no primeiro login.</p><button class="button button-quiet" type="button" data-auth-mode="login">Voltar ao login</button>`);
}

export function renderChangePassword(message = "", { forced = false } = {}) {
  return authShell(`${authMobileBrand()}<p class="eyebrow">Segurança</p><h1>${forced ? "Defina uma nova senha" : "Alterar senha"}</h1><p class="auth-intro">${forced ? "Sua senha foi redefinida por um administrador. Crie uma senha pessoal para continuar." : "Escolha uma nova senha forte."}</p>${messageBox(message)}<form data-auth-form="change-password">${passwordField("Senha atual", "currentPassword", { placeholder: forced ? "Senha temporária" : "Senha atual" })}${passwordField("Nova senha", "password", { autocomplete: "new-password", placeholder: "Crie uma senha forte", withChecklist: true })}${passwordField("Confirmar nova senha", "passwordConfirm", { autocomplete: "new-password", placeholder: "Repita a nova senha" })}<button class="button button-primary auth-submit" type="submit">Salvar nova senha <span>→</span></button>${forced ? `<button class="button button-quiet" type="button" data-auth-logout-inline>Sair</button>` : `<button class="button button-quiet" type="button" data-auth-mode="cancel">Cancelar</button>`}</form>`);
}
