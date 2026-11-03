# Number Ops — Roadmap

> **Nota:** este documento descreve o planejamento original da V1 e permanece como registro histórico. A versão atual roda localmente com **servidor em Python (biblioteca padrão) e banco SQLite**, autenticação própria com política de senha forte, solicitações de acesso validadas por CPF e aprovadas pelo MASTER, níveis de acesso (MASTER/ADMIN/USER/VIEWER), campanhas e Registro de atividades. Veja o README.md.

## Visão Geral

O desenvolvimento do Number Ops será realizado de forma incremental.

A prioridade é construir primeiro uma versão web funcional capaz de resolver o problema principal da operação.

Recursos mais complexos, como backend, banco de dados e integrações externas, serão adicionados somente após a validação da primeira versão.

---

# FASE 0 — Preparação

## Objetivo

Preparar o ambiente e estabelecer a base do projeto.

### Tarefas

- [x] Criar repositório Git
- [x] Criar estrutura inicial de pastas
- [x] Criar `.gitignore`
- [x] Criar `PROJECT.md`
- [x] Criar `REQUIREMENTS.md`
- [ ] Criar `README.md`
- [ ] Realizar primeiro commit
- [ ] Conectar ao GitHub
- [ ] Validar ambiente de desenvolvimento

### Resultado esperado

Projeto organizado, documentado e versionado.

---

# FASE 1 — Estrutura Frontend

## Objetivo

Criar a estrutura visual inicial da aplicação.

### Tarefas

- [ ] Criar `index.html`
- [ ] Criar estrutura CSS
- [ ] Criar estrutura JavaScript
- [ ] Definir layout principal
- [ ] Criar navegação
- [ ] Criar sidebar
- [ ] Criar área de conteúdo
- [ ] Definir identidade visual
- [ ] Tornar interface responsiva

### Resultado esperado

Aplicação navegável visualmente, ainda sem dados reais.

---

# FASE 2 — Modelo de Dados Frontend

## Objetivo

Definir como os dados serão representados no JavaScript.

### Tarefas

- [ ] Criar modelo de número
- [ ] Criar modelo de cliente
- [ ] Criar modelo de grupo
- [ ] Criar modelo de ocorrência
- [ ] Criar modelo de histórico
- [ ] Definir IDs únicos
- [ ] Criar dados fictícios para desenvolvimento

### Resultado esperado

Estrutura de dados consistente para toda a aplicação.

---

# FASE 3 — Gerenciamento de Números

## Objetivo

Implementar a funcionalidade principal do sistema.

### Tarefas

- [ ] Listar números
- [ ] Adicionar número
- [ ] Editar número
- [ ] Visualizar detalhes
- [ ] Arquivar número
- [ ] Exibir status
- [ ] Alterar status
- [ ] Exibir localização
- [ ] Alterar localização
- [ ] Definir responsável
- [ ] Alterar responsável

### Resultado esperado

Usuário consegue controlar completamente os números cadastrados.

---

# FASE 4 — Clientes e Grupos

## Objetivo

Permitir visualizar os relacionamentos de cada número.

### Tarefas

- [ ] Criar clientes
- [ ] Associar cliente ao número
- [ ] Remover cliente
- [ ] Criar registros de grupos
- [ ] Associar grupo ao número
- [ ] Remover grupo
- [ ] Visualizar relacionamentos
- [ ] Filtrar por cliente
- [ ] Filtrar por grupo

### Observação

Os grupos são apenas informações de relacionamento.

O Number Ops não administrará grupos do WhatsApp.

### Resultado esperado

É possível saber em quais clientes e grupos cada número está relacionado.

---

# FASE 5 — Ocorrências

## Objetivo

Criar controle das ocorrências operacionais dos números.

### Tarefas

- [ ] Registrar ocorrência
- [ ] Registrar queda
- [ ] Registrar restrição
- [ ] Registrar bloqueio
- [ ] Registrar problema no chip
- [ ] Registrar problema no aparelho
- [ ] Adicionar observações
- [ ] Registrar responsável
- [ ] Resolver ocorrência
- [ ] Registrar data de resolução

### Resultado esperado

Cada problema relacionado a um número possui registro próprio.

---

# FASE 6 — Status e Histórico

## Objetivo

Criar rastreabilidade das alterações.

### Tarefas

- [ ] Criar histórico
- [ ] Registrar alteração de status
- [ ] Registrar alteração de localização
- [ ] Registrar alteração de responsável
- [ ] Registrar cliente adicionado/removido
- [ ] Registrar grupo adicionado/removido
- [ ] Registrar ocorrências
- [ ] Criar linha do tempo do número

### Resultado esperado

É possível entender a trajetória operacional de cada número.

---

# FASE 7 — Persistência Local

## Objetivo

Garantir que os dados não desapareçam ao fechar o navegador.

### Tarefas

- [ ] Implementar camada de armazenamento
- [ ] Utilizar LocalStorage inicialmente
- [ ] Criar funções de leitura
- [ ] Criar funções de gravação
- [ ] Criar funções de atualização
- [ ] Criar funções de exclusão/arquivamento
- [ ] Criar inicialização dos dados
- [ ] Testar persistência

### Resultado esperado

Os dados continuam disponíveis após fechar e abrir o navegador.

---

# FASE 8 — Dashboard

## Objetivo

Criar uma visão geral da operação.

### Tarefas

- [ ] Total de números
- [ ] Total de ativos
- [ ] Total em aquecimento
- [ ] Total em análise
- [ ] Total bloqueados
- [ ] Total inativos
- [ ] Números recentemente alterados
- [ ] Ocorrências recentes
- [ ] Alertas
- [ ] Links rápidos

### Resultado esperado

O usuário consegue entender a situação da operação rapidamente.

---

# FASE 9 — Busca e Filtros

## Objetivo

Facilitar a localização das informações.

### Tarefas

- [ ] Busca por número
- [ ] Busca por identificação
- [ ] Busca por cliente
- [ ] Busca por grupo
- [ ] Busca por responsável
- [ ] Busca por localização
- [ ] Filtro por status
- [ ] Filtro por cliente
- [ ] Filtro por grupo
- [ ] Filtro por localização
- [ ] Combinação de filtros

### Resultado esperado

Encontrar qualquer número rapidamente.

---

# FASE 10 — Boas Práticas

## Objetivo

Criar uma área de consulta operacional.

### Tarefas

- [ ] Criar página de boas práticas
- [ ] Organizar por categorias
- [ ] Antes da operação
- [ ] Durante a operação
- [ ] Em caso de restrição
- [ ] Durante análise
- [ ] Após liberação

### Resultado esperado

Centralizar orientações importantes para a equipe.

---

# FASE 11 — Polimento da V1

## Objetivo

Preparar a aplicação para uso real como ferramenta frontend.

### Tarefas

- [ ] Melhorar responsividade
- [ ] Melhorar acessibilidade
- [ ] Melhorar mensagens de erro
- [ ] Criar confirmações de ações críticas
- [ ] Criar estados vazios
- [ ] Criar estados de carregamento
- [ ] Revisar navegação
- [ ] Revisar experiência do usuário
- [ ] Testar funcionalidades
- [ ] Corrigir bugs
- [ ] Revisar código
- [ ] Atualizar README

### Resultado esperado

MVP frontend funcional e consistente.

---

# FASE 12 — Backend

## Objetivo

Migrar o armazenamento local para uma infraestrutura centralizada.

### Tecnologias previstas

- Node.js
- Express
- MySQL
- API REST

### Tarefas futuras

- [ ] Criar backend
- [ ] Criar API
- [ ] Criar banco de dados
- [ ] Criar migrations/schema
- [ ] Criar autenticação
- [ ] Criar usuários
- [ ] Criar permissões
- [ ] Migrar dados para API
- [ ] Substituir armazenamento local
- [ ] Criar logs

### Resultado esperado

Sistema multiusuário com dados centralizados.

---

# FASE 13 — Integrações

## Objetivo

Conectar o Number Ops a ferramentas utilizadas pela operação.

### Possíveis integrações

- [ ] Ferramentas de disparo de mensagens
- [ ] Ferramentas de atendimento
- [ ] Webhooks
- [ ] APIs externas

### Possibilidades

- [ ] Sincronização de números
- [ ] Recebimento de eventos
- [ ] Atualização automática de status
- [ ] Automação de processos
- [ ] Monitoramento

### Observação

As integrações somente serão implementadas após a análise das APIs e capacidades disponíveis de cada plataforma.

---

# Ordem de Prioridade

A ordem de desenvolvimento deve seguir esta prioridade:

1. Controle dos números;
2. Status;
3. Localização;
4. Cadastro e edição;
5. Clientes;
6. Grupos relacionados;
7. Ocorrências;
8. Histórico;
9. Persistência;
10. Dashboard;
11. Busca e filtros;
12. Boas práticas;
13. Polimento;
14. Backend;
15. Integrações.

---

# Regra de Desenvolvimento

Não implementar funcionalidades de fases futuras antes que as funcionalidades da fase atual estejam funcionando e testadas.

Cada fase deve resultar em uma versão funcional antes do início da próxima fase.

O desenvolvimento deve ser incremental e versionado com Git.