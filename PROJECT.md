# Number Ops

> **Nota:** este documento descreve o planejamento original da V1 e permanece como registro histórico. A versão atual roda localmente com **servidor em Python (biblioteca padrão) e banco SQLite**, autenticação própria com política de senha forte, solicitações de acesso validadas por CPF e aprovadas pelo MASTER, níveis de acesso (MASTER/ADMIN/USER/VIEWER), campanhas e Registro de atividades. Veja o README.md.

## 1. Visão do Projeto

O Number Ops é um sistema web para gerenciamento e controle operacional dos números/chips utilizados pela empresa em operações de WhatsApp.

O sistema tem como objetivo centralizar as informações dos números e facilitar o controle de onde cada número está, qual é seu status operacional, quem é o responsável, quais clientes estão relacionados ao número e em quais grupos o número está cadastrado.

O sistema não tem como objetivo administrar os grupos do WhatsApp. Os grupos existem apenas como informação relacionada aos números.

---

## 2. Problema

Atualmente, o controle dos números utilizados na operação pode exigir consultas manuais e informações espalhadas.

O Number Ops deve centralizar essas informações em uma única interface, permitindo visualizar rapidamente:

- Quais números estão disponíveis;
- Quais números estão em análise;
- Quais números estão bloqueados;
- Onde cada número/chip está;
- Quem é o responsável pelo número;
- Quais clientes estão relacionados ao número;
- Em quais grupos o número está cadastrado;
- Histórico de ocorrências e alterações.

---

## 3. Objetivo da V1

A primeira versão do Number Ops será uma aplicação web funcional executada inicialmente apenas no navegador.

A V1 não terá backend ou banco de dados externo.

Os dados serão armazenados localmente no navegador, permitindo testar e utilizar o sistema antes da implementação de uma infraestrutura de backend.

### Funcionalidades principais da V1

- Dashboard;
- Cadastro de números;
- Edição de números;
- Arquivamento/exclusão de números;
- Busca de números;
- Filtros;
- Controle de status;
- Controle de localização;
- Controle de responsáveis;
- Associação de clientes;
- Associação de grupos;
- Registro de ocorrências;
- Histórico de alterações;
- Visualização detalhada de cada número;
- Guia de boas práticas.

---

## 4. Status dos Números

Cada número deverá possuir um status operacional.

Status iniciais:

- ACTIVE — Ativo
- WARMING — Em aquecimento
- UNDER_REVIEW — Em análise
- BLOCKED — Bloqueado
- INACTIVE — Inativo

Os valores internos podem utilizar identificadores em inglês, mas a interface deverá apresentar os nomes em português.

Exemplo:

`UNDER_REVIEW` → `Em análise`

---

## 5. Localização

Cada número poderá possuir uma localização operacional.

Exemplos:

- Celular 01;
- Celular 02;
- Celular 03;
- Estoque;
- Com funcionário;
- Em manutenção;
- Não localizado.

A estrutura deverá permitir que essas opções sejam ampliadas futuramente.

---

## 6. Clientes

Um número poderá estar relacionado a um ou mais clientes.

O sistema deve permitir visualizar essas relações.

Exemplo:

Número 01:

- Cliente A;
- Cliente B.

O sistema não deve assumir que um número pertence obrigatoriamente a apenas um cliente.

---

## 7. Grupos

Um número poderá estar relacionado a um ou mais grupos.

O Number Ops não será responsável por criar, editar ou administrar grupos do WhatsApp.

Os grupos serão utilizados apenas como informações de relacionamento.

Exemplo:

Número 01:

- Grupo Campanha A;
- Grupo Cliente A;
- Grupo Lives.

---

## 8. Ocorrências

O sistema deverá permitir registrar ocorrências relacionadas aos números.

Exemplos:

- Restrição;
- Queda;
- Bloqueio;
- Problema no chip;
- Problema no aparelho;
- Outro.

Ao registrar uma ocorrência de queda ou restrição, o sistema deverá permitir colocar o número automaticamente no status `UNDER_REVIEW`.

Uma ocorrência deverá registrar, quando aplicável:

- Tipo;
- Data e hora;
- Número relacionado;
- Responsável;
- Descrição;
- Data de resolução;
- Status da ocorrência.

---

## 9. Histórico

Cada número deverá possuir um histórico de alterações importantes.

Exemplos:

- Número cadastrado;
- Status alterado;
- Localização alterada;
- Cliente adicionado;
- Cliente removido;
- Grupo adicionado;
- Grupo removido;
- Ocorrência registrada;
- Ocorrência resolvida.

O histórico será importante para entender a trajetória operacional de cada número.

---

## 10. Dashboard

O dashboard deverá apresentar uma visão geral da operação.

Indicadores iniciais:

- Total de números;
- Números ativos;
- Números em aquecimento;
- Números em análise;
- Números bloqueados;
- Números inativos.

Também poderá apresentar:

- Números recentemente alterados;
- Ocorrências recentes;
- Números em análise;
- Alertas importantes.

---

## 11. Busca e Filtros

O sistema deverá permitir localizar rapidamente um número.

A busca poderá utilizar:

- Número;
- Identificação;
- Cliente;
- Grupo;
- Localização;
- Responsável.

Filtros deverão permitir organizar a visualização por:

- Status;
- Localização;
- Cliente;
- Grupo;
- Responsável.

---

## 12. Armazenamento na V1

Na primeira versão, os dados serão armazenados localmente no navegador.

A tecnologia inicial poderá utilizar:

- LocalStorage;
- IndexedDB, caso a complexidade dos dados exija.

A implementação deverá ser estruturada de maneira que a camada de armazenamento possa ser substituída futuramente por uma API sem exigir uma reconstrução completa da interface.

---

## 13. Evolução Futura

O Number Ops deverá ser desenvolvido com possibilidade de evolução.

Fases futuras poderão incluir:

### Backend

- Node.js;
- Express;
- API REST;
- MySQL;
- Autenticação;
- Usuários;
- Permissões;
- Logs.

### Integrações

- Ferramentas de disparo de mensagens;
- Ferramentas de atendimento;
- Webhooks;
- APIs externas;
- Automação de atualização de status.

As integrações externas não fazem parte da V1.

---

## 14. Princípios do Projeto

O desenvolvimento deverá seguir alguns princípios:

1. Priorizar funcionalidades realmente úteis para a operação.
2. Evitar complexidade desnecessária.
3. Manter o código organizado e modular.
4. Evitar dependências desnecessárias.
5. Desenvolver de forma incremental.
6. Não implementar funcionalidades futuras antes da necessidade.
7. Manter a interface simples e rápida para operações frequentes.
8. Preservar a possibilidade de evolução para backend.
9. Não armazenar informações sensíveis ou credenciais no código.
10. Utilizar dados fictícios durante o desenvolvimento e testes.

---

## 15. Escopo Atual

O foco atual do projeto é construir uma aplicação web funcional para controle operacional dos números.

O foco não é:

- Criar grupos de WhatsApp;
- Administrar grupos;
- Enviar mensagens;
- Substituir ferramentas de disparo de mensagens;
- Substituir ferramentas de atendimento;
- Automatizar disparos;
- Integrar APIs externas na V1.

Essas possibilidades poderão ser avaliadas futuramente.

---

## 16. Estado Atual do Projeto

O projeto está no início do desenvolvimento.

A prioridade atual é construir a V1 frontend-first, validando a experiência e as funcionalidades principais antes da implementação do backend.