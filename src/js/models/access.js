// Hierarquia de acesso: MASTER > ADMIN > USER > VIEWER
export const ACCESS_LEVELS = Object.freeze(["MASTER", "ADMIN", "USER", "VIEWER"]);
export const ACCESS_LEVEL_LABELS = Object.freeze({ MASTER: "Master", ADMIN: "Admin", USER: "User", VIEWER: "Viewer" });

const levelOf = (value) => (typeof value === "string" ? value : value?.access_level ?? "");

export function isMaster(profileOrLevel) { return levelOf(profileOrLevel) === "MASTER"; }
export function isAdminOrAbove(profileOrLevel) { const level = levelOf(profileOrLevel); return level === "MASTER" || level === "ADMIN"; }
/** Qualquer nível operacional (MASTER/ADMIN/USER) — só VIEWER não pode. Mesmo tier de
 * escrita já usado em numbers/campaigns/incidents; não inventa um cargo novo. */
export function canOperate(profileOrLevel) { return levelOf(profileOrLevel) !== "VIEWER" && levelOf(profileOrLevel) !== ""; }
export function canManageAccessLevel(profileOrLevel) { return isMaster(profileOrLevel); }
export function canHardDelete(profileOrLevel) { return isMaster(profileOrLevel); }

/** Nível de acesso "efetivo" de um profile só é válido se o usuário estiver ativo. */
export function activeMasters(profiles = []) {
  return profiles.filter((profile) => profile.access_level === "MASTER" && profile.status === "ACTIVE");
}

/**
 * Garante que a alteração pretendida não deixe o sistema sem nenhum MASTER ativo.
 * `nextLevel` = novo access_level pretendido (ou null para exclusão). `nextStatus` opcional.
 * Lança Error se a operação remover o último MASTER ativo.
 */
export function assertLastMasterSafe(profiles, targetId, { nextLevel = undefined, nextStatus = undefined, removing = false } = {}) {
  const target = profiles.find((profile) => profile.id === targetId);
  if (!target || target.access_level !== "MASTER" || target.status !== "ACTIVE") return;
  const stillMaster = !removing && (nextLevel ?? "MASTER") === "MASTER" && (nextStatus ?? "ACTIVE") === "ACTIVE";
  if (stillMaster) return;
  const others = activeMasters(profiles).filter((profile) => profile.id !== targetId);
  if (others.length === 0) throw new Error("O sistema precisa de pelo menos um MASTER ativo. Promova outro usuário antes.");
}
