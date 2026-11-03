import { ApiStateRepository } from "./repositories/api-state-repository.js";
import { ApiAuthRepository, createApiRepositories, createHardDeletePort } from "./repositories/api-repositories.js";
import { NumbersService } from "./services/numbers-service.js";
import { NumbersController } from "./controllers/numbers-controller.js";
import { DirectoryController } from "./controllers/directory-controller.js";
import { DirectoryService } from "./services/directory-service.js";
import { HistoryService } from "./services/history-service.js";
import { IncidentsService } from "./services/incidents-service.js";
import { IncidentsController } from "./controllers/incidents-controller.js";
import { HistoryController } from "./controllers/history-controller.js";
import { DashboardService } from "./services/dashboard-service.js";
import { DashboardController } from "./controllers/dashboard-controller.js";
import { GuideController } from "./controllers/guide-controller.js";
import { BackupService } from "./services/backup-service.js";
import { BackupController } from "./controllers/backup-controller.js";
import { CampaignsService } from "./services/campaigns-service.js";
import { CampaignsController } from "./controllers/campaigns-controller.js";
import { getViewTitle, renderView } from "./ui/views.js";
import { AuthService } from "./services/auth-service.js";
import { AuthController } from "./controllers/auth-controller.js";
import { PasswordController } from "./controllers/password-controller.js";
import { ProfilesService } from "./services/profiles-service.js";
import { ProfilesController } from "./controllers/profiles-controller.js";
import { SignupRequestsService } from "./services/signup-requests-service.js";
import { AuditLogService } from "./services/audit-log-service.js";
import { AuditLogController } from "./controllers/audit-log-controller.js";
import { AboutController } from "./controllers/about-controller.js";
import { ACCESS_LEVEL_LABELS, isAdminOrAbove, isMaster } from "./models/access.js";
import { initTheme, bindThemeToggles } from "./ui/theme-toggle.js";
import { observeTableScrollHints } from "./ui/table-scroll-hint.js";
import { showToast } from "./ui/toast.js";
import { getBackendMode } from "./infra/api-client.js";

initTheme();
bindThemeToggles();

const content=document.querySelector("#page-content");
observeTableScrollHints(content);
const title=document.querySelector("#page-title");
const navigationLinks=document.querySelectorAll("[data-view]");
const appShell=document.querySelector(".app-shell");
const topbar=document.querySelector(".topbar");
const menuToggle=document.querySelector("[data-mobile-nav-toggle]");
const mobileNavClose=document.querySelector("[data-mobile-nav-close]");
const logoutButton=document.querySelector("[data-auth-logout]");
let controllers=null;
let profilesController=null;
let auditLogController=null;
let internalRoutesEnabled=false;
new AboutController({trigger:document.querySelector("[data-about-open]")}).bind();

function createOperationalControllers(repository,{hardDeletePort=null,currentProfile=null}={}) {
  const numbersService=new NumbersService(repository,{hardDeletePort});
  const campaignsService=new CampaignsService(numbersService);
  campaignsService.reconcileClientSquadFromActiveLinks();
  const directoryService=new DirectoryService(numbersService);
  return {
    numbersService,
    numbers:new NumbersController({service:numbersService,campaignsService,content}),
    campaigns:new CampaignsController({service:campaignsService,content,currentProfile}),
    directories:Object.fromEntries(["clients","groups","responsibles","locations"].map((type)=>[type,new DirectoryController({service:directoryService,campaignsService,content,type})])),
    incidents:new IncidentsController({service:new IncidentsService(numbersService,new HistoryService(numbersService)),numbers:numbersService,content}),
    history:new HistoryController({service:new HistoryService(numbersService),numbers:numbersService,content}),
    dashboard:new DashboardController({service:new DashboardService(numbersService),content}),
    guide:new GuideController({content}),
    backup:new BackupController({service:new BackupService(numbersService),content,canRestore:isMaster(currentProfile)}),
  };
}

// Badge + aviso de solicitações de acesso pendentes (somente MASTER). Consulta o servidor
// a cada minuto e avisa quando chega uma solicitação nova.
function watchSignupRequests(requestsService,initialCount) {
  const badge=document.querySelector("[data-signup-badge]");
  let last=initialCount;
  const paint=(count)=>{ if(!badge)return; badge.hidden=!count; badge.textContent=count>99?"99+":String(count); };
  paint(initialCount);
  if(initialCount) showToast(`${initialCount} solicitação(ões) de acesso aguardando sua aprovação em Usuários.`,"info",7000);
  window.setInterval(async()=>{
    try {
      const count=await requestsService.pendingCount();
      if(count>last) showToast("Nova solicitação de acesso recebida. Veja em Usuários.","info",7000);
      last=count; paint(count);
    } catch { /* servidor fora do ar ou sessão expirada: tenta de novo no próximo ciclo */ }
  },60_000);
  return (count)=>{ last=count; paint(count); };
}

// "Números" reúne, como abas (dentro dos próprios controllers — ver
// NumbersController.render/DirectoryController.render), a lista de números
// e a área de Localizações — ambas continuam sendo as mesmas telas/rotas de
// sempre, só deixam de ocupar item próprio na sidebar. "locations" nunca
// colide com um id real de número (createId sempre gera "number_<uuid>").
function showView(viewName) {
  if(!controllers)return;
  const [view,resourceId]=viewName.split("/");
  if(view==="dashboard")controllers.dashboard.render();
  else if(view==="numbers"&&resourceId==="locations")controllers.directories.locations.render();
  else if(view==="numbers"&&resourceId)controllers.numbers.showDetail(resourceId);
  else if(view==="numbers")controllers.numbers.render();
  else if(view==="campaigns")resourceId?controllers.campaigns.detail(resourceId):controllers.campaigns.render();
  else if(view==="profiles"&&profilesController)profilesController.render();
  else if(view==="activity"&&auditLogController)auditLogController.render();
  else if(view==="activity"){window.location.hash="#dashboard";return;}
  else if(controllers.directories[view])controllers.directories[view].render();
  else if(view==="incidents"&&resourceId)controllers.incidents.detail(resourceId);
  else if(view==="incidents")controllers.incidents.render();
  else if(view==="history")controllers.history.render();
  else if(view==="guide")controllers.guide.render();
  else if(view==="backup")controllers.backup.render();
  else if(views_has(view))content.innerHTML=renderView(view);
  else {window.location.hash="#dashboard";return;}
  title.textContent=getViewTitle(view);
  navigationLinks.forEach((link)=>link.classList.toggle("is-active",link.dataset.view===view));
  setMobileNavigation(false);
}

function views_has(view){return ["clients","groups","responsibles","locations","numbers","campaigns","incidents","history","guide","backup","dashboard","profiles","activity"].includes(view);}

function currentView(){return window.location.hash.slice(1)||"dashboard";}
function setMobileNavigation(open){appShell.classList.toggle("is-nav-open",open);menuToggle.setAttribute("aria-expanded",String(open));menuToggle.setAttribute("aria-label",open?"Fechar menu":"Abrir menu");}
function updateStickyHeader(){const compact=window.scrollY>12;topbar.classList.toggle("is-compact",compact);appShell.classList.toggle("has-compact-header",compact);}

window.addEventListener("hashchange",()=>{if(internalRoutesEnabled)showView(currentView());});
window.addEventListener("scroll",updateStickyHeader,{passive:true});
menuToggle.addEventListener("click",()=>setMobileNavigation(!appShell.classList.contains("is-nav-open")));
mobileNavClose.addEventListener("click",()=>setMobileNavigation(false));
navigationLinks.forEach((link)=>link.addEventListener("click",()=>setMobileNavigation(false)));
window.addEventListener("keydown",(event)=>{if(event.key==="Escape"){content.querySelector(".modal-backdrop")?.remove();setMobileNavigation(false);}});
window.matchMedia("(min-width: 861px)").addEventListener("change",(event)=>{if(event.matches)setMobileNavigation(false);});

async function bootstrap() {
  const authService=new AuthService(new ApiAuthRepository());
  const authController=new AuthController({service:authService,root:appShell});
  if(await getBackendMode()==="browser") {
    content.innerHTML='<section class="directory-empty"><div><h2>Iniciando o backend Python…</h2><p>Sem servidor: o Python roda no seu navegador (Pyodide). A primeira abertura pode levar alguns segundos.</p></div></section>';
    document.querySelector(".sidebar-note").textContent="Dados neste navegador · Python (Pyodide) + SQLite";
  }
  const session=await authService.getSession();
  if(!session.authenticated) {
    authController.mode=session.needsSetup?"setup":"login";
    await authController.render();
    return;
  }
  const profile=session.profile;
  if(profile.must_change_password) {
    authController.profile=profile;
    authController.mode="change-password";
    await authController.render();
    return;
  }
  appShell.classList.remove("is-auth-screen");
  appShell.dataset.accessLevel=profile.access_level;
  content.innerHTML='<section class="directory-empty"><div><h2>Carregando dados…</h2><p>Buscando informações no servidor local.</p></div></section>';
  const repositories=createApiRepositories();
  const stateRepository=await ApiStateRepository.create();
  // Se o servidor recusar uma gravação (permissão, validação, outra pessoa alterou antes),
  // recarrega a tela para o estado voltar a refletir exatamente o que está no banco.
  stateRepository.onRejected=(error)=>{
    if(error.status===401){window.location.reload();return;}
    showToast(`${error.message} A tela será recarregada com os dados do servidor.`,"error",4000);
    window.setTimeout(()=>window.location.reload(),3500);
  };
  controllers=createOperationalControllers(stateRepository,{hardDeletePort:createHardDeletePort(),currentProfile:profile});
  const requestsService=new SignupRequestsService(repositories.signupRequests);
  const updateBadge=isMaster(profile)?watchSignupRequests(requestsService,session.pendingSignupRequests??0):null;
  profilesController=new ProfilesController({service:new ProfilesService(repositories.profiles,repositories.squads),requestsService,content,currentProfile:profile,onRequestsChanged:updateBadge});
  if(isAdminOrAbove(profile)) auditLogController=new AuditLogController({service:new AuditLogService({repository:repositories.auditLogs,profilesRepository:repositories.profiles,squadsRepository:repositories.squads,numbersService:controllers.numbersService,currentProfile:profile}),content});
  document.querySelectorAll("[data-admin-only]").forEach((item)=>{item.hidden=!isAdminOrAbove(profile);});
  document.querySelectorAll("[data-master-only]").forEach((item)=>{item.hidden=!isMaster(profile);});
  const profileLabel=document.createElement("span");
  profileLabel.dataset.profileLabel="";
  profileLabel.className="environment-label";
  profileLabel.textContent=`${profile.name} · ${ACCESS_LEVEL_LABELS[profile.access_level]??profile.access_level}`;
  logoutButton.before(profileLabel);
  authController.bindLogout(logoutButton);
  new PasswordController({service:authService,profile}).bind(document.querySelector("[data-change-password]"));
  internalRoutesEnabled=true;
  showView(currentView());
  updateStickyHeader();
  bindThemeToggles();
}

bootstrap().catch((error)=>{
  console.error("Falha ao iniciar o Number Ops.",error);
  // Aberto pelo Live Server/arquivo local: não existe API aqui, só o servidor Python a fornece.
  const withoutApi=error?.status===404||error?.status===0||error?.status===405||window.location.protocol==="file:";
  content.innerHTML=withoutApi
    ?'<section class="directory-empty"><div><h2>O servidor do Number Ops não foi encontrado</h2><p>Esta página precisa ser aberta pelo servidor Python, não pelo Live Server nem direto do arquivo.</p><p>1. No terminal, dentro da pasta do projeto, rode <strong>python server.py</strong> (ou dê duplo clique em <strong>iniciar.bat</strong>).<br>2. Acesse <a href="http://127.0.0.1:8000/">http://127.0.0.1:8000</a>.</p></div></section>'
    :'<section class="directory-empty"><div><h2>Não foi possível carregar o Number Ops</h2><p>Verifique se o servidor está em execução (python server.py) e recarregue a página.</p></div></section>';
});
