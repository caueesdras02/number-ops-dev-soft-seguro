import { NUMBER_STATUSES } from "../config/constants.js";
import { getUtilization, UTILIZATION } from "../models/number.js";

export class DashboardService {
  constructor(numbersService) { this.numbersService = numbersService; }
  getData() {
    const s = this.numbersService.state, active = s.numbers.filter((n) => !n.archivedAt), name = (items, id) => items.find((item) => item.id === id)?.name ?? "Não definido";
    const links = s.numberCampaignLinks ?? [];
    const hasActiveLink = (numberId) => links.some((link) => link.numberId === numberId && !link.endedAt);
    const utilization = (n) => getUtilization(n, hasActiveLink(n.id));
    const countBy = (items, key, labels = null) => Object.entries(items.reduce((a, item) => { const k = labels ? labels(item) : item[key]; a[k] = (a[k] || 0) + 1; return a; }, {})).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    const related = (field, entities) => entities.map((e) => ({ label: e.name, count: active.filter((n) => (n[field] || []).includes(e.id)).length })).filter((x) => x.count).sort((a, b) => b.count - a.count);
    const open = s.incidents.filter((i) => i.status === "OPEN");
    return {
      metrics: {
        total: active.length,
        available: active.filter((n) => utilization(n) === UTILIZATION.AVAILABLE).length,
        inUse: active.filter((n) => utilization(n) === UTILIZATION.IN_USE).length,
        warming: active.filter((n) => n.status === NUMBER_STATUSES.WARMING).length,
        review: active.filter((n) => n.status === NUMBER_STATUSES.UNDER_REVIEW).length,
        blocked: active.filter((n) => n.status === NUMBER_STATUSES.BLOCKED).length,
        open: open.length,
      },
      status: countBy(active, "status"),
      responsibles: countBy(active, "responsibleId", (n) => name(s.responsibles, n.responsibleId)),
      locations: countBy(active, "locationId", (n) => name(s.locations, n.locationId)),
      clients: related("clientIds", s.clients),
      groups: related("groupIds", s.groups),
      attention: { blocked: active.filter((n) => n.status === NUMBER_STATUSES.BLOCKED), review: active.filter((n) => n.status === NUMBER_STATUSES.UNDER_REVIEW), open },
      recent: {
        history: [...s.historyEvents].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 6),
        incidents: [...s.incidents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6),
      },
      numbers: s.numbers,
    };
  }
}
