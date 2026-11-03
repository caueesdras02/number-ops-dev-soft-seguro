// Regras de exclusão definitiva (MASTER). "Bloqueia quando referenciado" — sem
// cascade destrutivo silencioso. `blockers` impedem a exclusão; `effects` são
// consequências declaradas (FK on delete set null / cascade) mostradas na confirmação.

const arr = (state, key) => (Array.isArray(state[key]) ? state[key] : []);

export function describeReferences(state, entity, id) {
  const blockers = [];
  const effects = [];
  const push = (list, count, label) => { if (count > 0) list.push({ count, label }); };

  if (entity === "numbers") {
    push(blockers, arr(state, "numberCampaignLinks").filter((l) => l.numberId === id).length, "vínculo(s) de campanha");
    push(blockers, arr(state, "incidents").filter((i) => i.numberId === id).length, "ocorrência(s)");
    push(effects, arr(state, "historyEvents").filter((h) => h.numberId === id).length, "evento(s) de histórico serão removidos");
  } else if (entity === "clients") {
    push(blockers, arr(state, "campaigns").filter((c) => c.clientId === id).length, "campanha(s)");
    push(effects, arr(state, "numbers").filter((n) => (n.clientIds ?? []).includes(id)).length, "número(s) perderão este cliente");
  } else if (entity === "groups") {
    push(blockers, arr(state, "campaigns").filter((c) => c.squadId === id).length, "campanha(s)");
    push(effects, arr(state, "numbers").filter((n) => (n.groupIds ?? []).includes(id)).length, "número(s) perderão este squad");
    push(effects, arr(state, "clients").filter((c) => c.squadId === id).length, "cliente(s) ficarão sem squad");
    push(effects, arr(state, "responsibles").filter((r) => r.squadId === id).length, "colaborador(es) ficarão sem squad");
  } else if (entity === "responsibles") {
    push(effects, arr(state, "numbers").filter((n) => n.responsibleId === id).length, "número(s) ficarão sem colaborador");
    push(effects, arr(state, "incidents").filter((i) => i.responsibleId === id || i.resolvedById === id).length, "ocorrência(s) perderão a referência");
    push(effects, arr(state, "campaigns").filter((c) => c.responsibleId === id).length, "campanha(s) ficarão sem responsável");
  } else if (entity === "locations") {
    push(effects, arr(state, "numbers").filter((n) => n.locationId === id).length, "número(s) ficarão sem localização");
  } else if (entity === "campaigns") {
    push(blockers, arr(state, "numberCampaignLinks").filter((l) => l.campaignId === id).length, "vínculo(s) de número");
  }
  return { blockers, effects };
}

export function assertHardDeletable(state, entity, id) {
  const { blockers } = describeReferences(state, entity, id);
  if (blockers.length) {
    throw new Error(`Não é possível excluir definitivamente: ${blockers.map((b) => `${b.count} ${b.label}`).join(", ")}. Arquive o registro ou remova as referências antes.`);
  }
}

/** Aplica a exclusão no estado local, mantendo relações consistentes (espelha o on delete set null / cascade do banco). */
export function applyLocalHardDelete(state, entity, id) {
  if (entity === "numbers") {
    state.numbers = arr(state, "numbers").filter((n) => n.id !== id);
    state.numberCampaignLinks = arr(state, "numberCampaignLinks").filter((l) => l.numberId !== id);
    state.incidents = arr(state, "incidents").filter((i) => i.numberId !== id);
    state.historyEvents = arr(state, "historyEvents").filter((h) => h.numberId !== id);
  } else if (entity === "clients") {
    state.clients = arr(state, "clients").filter((c) => c.id !== id);
    state.numbers = arr(state, "numbers").map((n) => ({ ...n, clientIds: (n.clientIds ?? []).filter((x) => x !== id) }));
  } else if (entity === "groups") {
    state.groups = arr(state, "groups").filter((g) => g.id !== id);
    state.numbers = arr(state, "numbers").map((n) => ({ ...n, groupIds: (n.groupIds ?? []).filter((x) => x !== id) }));
    state.clients = arr(state, "clients").map((c) => (c.squadId === id ? { ...c, squadId: null } : c));
    state.responsibles = arr(state, "responsibles").map((r) => (r.squadId === id ? { ...r, squadId: null } : r));
  } else if (entity === "responsibles") {
    state.responsibles = arr(state, "responsibles").filter((r) => r.id !== id);
    state.numbers = arr(state, "numbers").map((n) => (n.responsibleId === id ? { ...n, responsibleId: null } : n));
    state.incidents = arr(state, "incidents").map((i) => ({ ...i, responsibleId: i.responsibleId === id ? null : i.responsibleId, resolvedById: i.resolvedById === id ? null : i.resolvedById }));
    state.campaigns = arr(state, "campaigns").map((c) => (c.responsibleId === id ? { ...c, responsibleId: null } : c));
  } else if (entity === "locations") {
    state.locations = arr(state, "locations").filter((l) => l.id !== id);
    state.numbers = arr(state, "numbers").map((n) => (n.locationId === id ? { ...n, locationId: null } : n));
  } else if (entity === "campaigns") {
    state.campaigns = arr(state, "campaigns").filter((c) => c.id !== id);
    state.numberCampaignLinks = arr(state, "numberCampaignLinks").filter((l) => l.campaignId !== id);
  }
}
