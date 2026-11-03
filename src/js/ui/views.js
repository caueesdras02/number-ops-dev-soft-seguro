const views = Object.freeze({
  dashboard: { title: "Visão geral", description: "A base visual está pronta. Os indicadores operacionais serão incluídos quando a gestão de números estiver implementada." },
  numbers: { title: "Números", description: "A área de cadastro, listagem, edição e arquivamento será construída nas próximas fases." },
  campaigns: { title: "Campanhas", description: "Gerencie campanhas e seus vínculos operacionais." },
  profiles: { title: "Usuários", description: "Gerencie profiles e níveis de acesso." },
  clients: { title: "Clientes", description: "" }, groups: { title: "Squads", description: "" }, responsibles: { title: "Colaboradores", description: "" }, locations: { title: "Localizações", description: "" },
  incidents: { title: "Ocorrências", description: "O modelo de ocorrências já está definido. O registro e a resolução serão implementados em uma etapa posterior." },
  history: { title: "Histórico", description: "Consulta dos eventos operacionais registrados." },
  activity: { title: "Registro de atividades", description: "Rastreabilidade das alterações realizadas no sistema." },
  guide: { title: "Boas práticas", description: "Esta área reunirá orientações operacionais organizadas para consulta da equipe." },
  backup: { title: "Dados e Backup", description: "Exporte ou restaure a base do Number Ops." },
});

export function renderView(viewName) {
  const view = views[viewName] ?? views.dashboard;
  return `<article class="placeholder-card"><h2>${view.title}</h2><p>${view.description}</p><ul class="foundation-list"><li>Layout responsivo e navegação inicial</li><li>Modelos de dados definidos sem dados reais</li><li>Persistência local preparada e isolada da interface</li></ul></article>`;
}

export function getViewTitle(viewName) { return (views[viewName] ?? views.dashboard).title; }
