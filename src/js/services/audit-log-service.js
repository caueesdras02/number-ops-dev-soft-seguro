import { isAdminOrAbove } from "../models/access.js";

const ACTION_LABELS = Object.freeze({
  NUMBER_CREATED: "Número criado",
  NUMBER_UPDATED: "Número editado",
  NUMBER_STATUS_CHANGED: "Status do número alterado",
  NUMBER_RESPONSIBLE_CHANGED: "Responsável do número alterado",
  NUMBER_LOCATION_CHANGED: "Localização do número alterada",
  NUMBER_GROUP_COUNT_CHANGED: "Quantidade de grupos alterada",
  NUMBER_RESTRICTION_ADDED: "Restrição adicionada",
  NUMBER_RESTRICTION_REMOVED: "Restrição removida",
  NUMBER_RESTRICTION_UPDATED: "Restrição alterada",
  NUMBER_ARCHIVED: "Número arquivado",
  NUMBER_RESTORED: "Número restaurado",
  NUMBER_CLIENT_ASSOCIATED: "Cliente vinculado ao número",
  NUMBER_CLIENT_REMOVED: "Cliente removido do número",
  NUMBER_SQUAD_ASSOCIATED: "Squad vinculado ao número",
  NUMBER_SQUAD_REMOVED: "Squad removido do número",
  CAMPAIGN_CREATED: "Campanha criada",
  CAMPAIGN_UPDATED: "Campanha editada",
  CAMPAIGN_CLOSED: "Campanha encerrada",
  CAMPAIGN_REACTIVATED: "Campanha reativada",
  CAMPAIGN_RESPONSIBLE_CHANGED: "Responsável da campanha alterado",
  CAMPAIGN_STAGE_CHANGED: "Etapa da campanha alterada",
  NUMBER_CAMPAIGN_LINKED: "Número vinculado à campanha",
  NUMBER_CAMPAIGN_CHANGED: "Campanha do número alterada",
  NUMBER_CAMPAIGN_ROLE_CHANGED: "Papel do número alterado",
  NUMBER_CAMPAIGN_LINK_ENDED: "Vínculo de campanha encerrado",
  CLIENT_CREATED: "Cliente criado",
  CLIENT_UPDATED: "Cliente editado",
  CLIENT_SQUAD_CHANGED: "Squad do cliente alterado",
  SQUAD_CREATED: "Squad criado",
  SQUAD_UPDATED: "Squad editado",
  LOCATION_CREATED: "Localização criada",
  LOCATION_UPDATED: "Localização editada",
  LOCATION_RESPONSIBLE_CHANGED: "Colaborador da localização alterado",
  RESPONSIBLE_CREATED: "Colaborador criado",
  RESPONSIBLE_UPDATED: "Colaborador editado",
  RESPONSIBLE_TEAM_CHANGED: "Squad do colaborador alterado",
  INCIDENT_CREATED: "Ocorrência criada",
  INCIDENT_UPDATED: "Ocorrência editada",
  INCIDENT_RESOLVED: "Ocorrência resolvida",
  INCIDENT_REOPENED: "Ocorrência reaberta",
  INCIDENT_DELETED: "Ocorrência excluída definitivamente",
  NUMBER_DELETED: "Número excluído definitivamente",
  CAMPAIGN_DELETED: "Campanha excluída definitivamente",
  CLIENT_DELETED: "Cliente excluído definitivamente",
  SQUAD_DELETED: "Squad excluído definitivamente",
  LOCATION_DELETED: "Localização excluída definitivamente",
  RESPONSIBLE_DELETED: "Colaborador excluído definitivamente",
  PROFILE_DELETED: "Usuário excluído definitivamente",
  PROFILE_UPDATED: "Usuário editado",
  PROFILE_JOB_TITLE_CHANGED: "Cargo do usuário alterado",
  PROFILE_SQUAD_CHANGED: "Squad do usuário alterado",
  PROFILE_STATUS_CHANGED: "Status do usuário alterado",
  PROFILE_ACCESS_LEVEL_CHANGED: "Nível de acesso alterado",
  PROFILE_CREATED: "Usuário criado",
  PROFILE_PASSWORD_CHANGED: "Senha alterada/redefinida",
  SIGNUP_REQUESTED: "Solicitação de acesso enviada",
  SIGNUP_REQUEST_APPROVED: "Solicitação de acesso aprovada",
  SIGNUP_REQUEST_REJECTED: "Solicitação de acesso recusada",
  BACKUP_RESTORED: "Backup restaurado",
  LOGIN_SUCCEEDED: "Login realizado",
  LOGIN_FAILED: "Tentativa de login inválida",
  LOGIN_BLOCKED: "Login bloqueado (excesso de tentativas)",
  LOGOUT: "Logout",
  ACCESS_DENIED: "Acesso negado",
});

const ENTITY_LABELS = Object.freeze({ NUMBER: "Número", CAMPAIGN: "Campanha", CLIENT: "Cliente", SQUAD: "Squad", INCIDENT: "Ocorrência", USER: "Usuário", LOCATION: "Localização", RESPONSIBLE: "Colaborador", SIGNUP_REQUEST: "Solicitação de acesso", SYSTEM: "Sistema" });
const FIELD_LABELS = Object.freeze({ phone:"Número", identification:"Identificação", status:"Status", locationId:"Localização", responsibleId:"Responsável", groupCount:"Quantidade de grupos", notes:"Observações", squadId:"Squad", role:"Papel", campaignId:"Campanha", jobTitle:"Cargo", accessLevel:"Nível de acesso", name:"Nome", team:"Squad" });

const mapRow = (row) => ({ id:row.id,userId:row.user_id,action:row.action,entityType:row.entity_type,entityId:row.entity_id,occurredAt:row.occurred_at,previousData:row.previous_data,newData:row.new_data,metadata:row.metadata??{} });
const normalizeKey = (key) => key.replace(/_([a-z])/g, (_,letter)=>letter.toUpperCase());
const comparable = (value) => JSON.stringify(value ?? null);

export class AuditLogService {
  constructor({ repository, profilesRepository, squadsRepository, numbersService, currentProfile }) {
    this.repository=repository;
    this.profilesRepository=profilesRepository;
    this.squadsRepository=squadsRepository;
    this.numbers=numbersService;
    this.currentProfile=currentProfile;
  }

  async load() {
    if(!isAdminOrAbove(this.currentProfile)) throw new Error("Somente administradores ou MASTER podem consultar o Registro de atividades.");
    const [rows,profiles,squads]=await Promise.all([this.repository.list(),this.profilesRepository.list(),this.squadsRepository.list()]);
    const logs=rows.map(mapRow).map((log)=>this.enrich(log,profiles,squads)).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt));
    return { logs,profiles:profiles.sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")),squads:squads.filter((item)=>item.is_active).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")) };
  }

  filter(logs, filters={}) {
    const from=filters.dateFrom?new Date(`${filters.dateFrom}T00:00:00`).getTime():null;
    const to=filters.dateTo?new Date(`${filters.dateTo}T23:59:59.999`).getTime():null;
    return logs.filter((log)=>{
      const time=new Date(log.occurredAt).getTime();
      return (!filters.userId||log.userId===filters.userId)&&(!filters.squadId||log.squadId===filters.squadId)&&(!filters.action||log.action===filters.action)&&(!filters.entityType||log.entityType===filters.entityType)&&(!from||time>=from)&&(!to||time<=to);
    });
  }

  enrich(log,profiles,squads) {
    const state=this.numbers.state;
    const metadata=log.metadata??{};
    const user=profiles.find((item)=>item.id===log.userId);
    const entityName=this.entityName(log,state,profiles,squads);
    const squadId=metadata.squadId??metadata.squad_id??this.entitySquad(log,state,profiles);
    return {...log,userName:user?.name??"Sistema",actionLabel:ACTION_LABELS[log.action]??log.action,entityLabel:ENTITY_LABELS[log.entityType]??log.entityType,entityName,squadId,summary:this.summary(log)};
  }

  entityName(log,state,profiles,squads) {
    if(log.entityType==="NUMBER") return state.numbers.find((item)=>item.id===log.entityId)?.phone??log.entityId;
    if(log.entityType==="CAMPAIGN") return state.campaigns.find((item)=>item.id===log.entityId)?.name??log.entityId;
    if(log.entityType==="CLIENT") return state.clients.find((item)=>item.id===log.entityId)?.name??log.entityId;
    if(log.entityType==="SQUAD") return squads.find((item)=>item.id===log.entityId)?.name??log.entityId;
    if(log.entityType==="INCIDENT") return state.incidents.find((item)=>item.id===log.entityId)?.title??log.entityId;
    if(log.entityType==="USER") return profiles.find((item)=>item.id===log.entityId)?.name??log.newData?.email??log.entityId;
    if(log.entityType==="LOCATION") return state.locations.find((item)=>item.id===log.entityId)?.name??log.entityId;
    if(log.entityType==="RESPONSIBLE") return state.responsibles.find((item)=>item.id===log.entityId)?.name??log.entityId;
    return log.entityId||"—";
  }

  entitySquad(log,state,profiles) {
    if(log.entityType==="SQUAD") return log.entityId;
    if(log.entityType==="CAMPAIGN") return state.campaigns.find((item)=>item.id===log.entityId)?.squadId??null;
    if(log.entityType==="CLIENT") return state.clients.find((item)=>item.id===log.entityId)?.squadId??null;
    if(log.entityType==="NUMBER") return state.numbers.find((item)=>item.id===log.entityId)?.groupIds?.[0]??null;
    if(log.entityType==="USER") return profiles.find((item)=>item.id===log.entityId)?.squad_id??null;
    if(log.entityType==="INCIDENT") { const incident=state.incidents.find((item)=>item.id===log.entityId); return state.numbers.find((item)=>item.id===incident?.numberId)?.groupIds?.[0]??null; }
    return null;
  }

  summary(log) {
    const before=log.previousData??{},after=log.newData??{};
    // Login/acesso negado: mostra o motivo e o e-mail tentado em vez dos campos alterados.
    if(after.reason) return `${after.reason}${after.path?` (${after.path})`:` (${after.email})`}`;
    const keys=[...new Set([...Object.keys(before),...Object.keys(after)])].map(normalizeKey).filter((key)=>comparable(before[key]??before[key.replace(/[A-Z]/g,(letter)=>`_${letter.toLowerCase()}`)])!==comparable(after[key]??after[key.replace(/[A-Z]/g,(letter)=>`_${letter.toLowerCase()}`)]));
    if(!keys.length) return log.actionLabel;
    const labels=keys.slice(0,3).map((key)=>FIELD_LABELS[key]??key);
    return `${labels.join(", ")}${keys.length>3?` e mais ${keys.length-3}`:""}`;
  }
}

export { ACTION_LABELS, ENTITY_LABELS };
