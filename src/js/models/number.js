import { NUMBER_STATUSES } from "../config/constants.js";
import { createId, normalizePhone, now } from "./helpers.js";

export function createNumber({ phone, identification = "", status = NUMBER_STATUSES.INACTIVE, locationId = null, responsibleId = null, clientIds = [], groupIds = [], groupCount = 0, notes = "", restriction = null } = {}) {
  const timestamp = now();
  return { id: createId("number"), phone: normalizePhone(phone), identification, status, locationId, responsibleId, clientIds, groupIds, groupCount: Number.isInteger(Number(groupCount)) && Number(groupCount) >= 0 ? Number(groupCount) : 0, notes, restriction, archivedAt: null, createdAt: timestamp, updatedAt: timestamp };
}

/** Status operacional apto (independe de utilização/campanha). */
export function isAvailableForOperation(number) { return number.status === NUMBER_STATUSES.ACTIVE && !number.archivedAt; }

export const UTILIZATION = Object.freeze({ IN_USE: "IN_USE", AVAILABLE: "AVAILABLE", UNAVAILABLE: "UNAVAILABLE" });
export const UTILIZATION_LABELS = Object.freeze({ IN_USE: "Em uso", AVAILABLE: "Disponível", UNAVAILABLE: "Indisponível" });

/**
 * kinds de restrição que existem hoje (registerRestriction). Nem toda restrição impede
 * utilização — GROUP_CREATION/SEND_LIMIT/OTHER são limitações registradas mas não retiram
 * o número de operação. NO_AREA é uma condição operacional persistente: o número não pode
 * ser utilizado. Centralizado aqui para nunca precisar duplicar essa lista em service/UI.
 */
export const RESTRICTION_KINDS = Object.freeze({ GROUP_CREATION: "GROUP_CREATION", SEND_LIMIT: "SEND_LIMIT", NO_AREA: "NO_AREA", OTHER: "OTHER" });
export const BLOCKING_RESTRICTION_KINDS = Object.freeze(new Set([RESTRICTION_KINDS.NO_AREA]));

/** Restrição ativa cujo kind impede utilização do número (hoje: só NO_AREA). */
export function hasBlockingRestriction(number) {
  return Boolean(number?.restriction && BLOCKING_RESTRICTION_KINDS.has(number.restriction.kind));
}

/**
 * Utilização é DERIVADA (nunca armazenada):
 * - vínculo de campanha ativo => EM USO;
 * - sem vínculo ativo + operacionalmente apto + sem restrição bloqueante => DISPONÍVEL;
 * - caso contrário (bloqueado/inativo/em análise/arquivado/restrição bloqueante) => INDISPONÍVEL.
 */
export function getUtilization(number, hasActiveCampaignLink) {
  if (hasActiveCampaignLink) return UTILIZATION.IN_USE;
  if (isAvailableForOperation(number) && !hasBlockingRestriction(number)) return UTILIZATION.AVAILABLE;
  return UTILIZATION.UNAVAILABLE;
}
