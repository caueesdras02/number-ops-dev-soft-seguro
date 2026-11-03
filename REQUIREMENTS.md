# Number Ops — Requirements

> **Nota:** este documento descreve o planejamento original da V1 e permanece como registro histórico. A versão atual roda localmente com **servidor em Python (biblioteca padrão) e banco SQLite**, autenticação própria com política de senha forte, solicitações de acesso validadas por CPF e aprovadas pelo MASTER, níveis de acesso (MASTER/ADMIN/USER/VIEWER), campanhas e Registro de atividades. Veja o README.md.

## 1. Objetivo

Definir os requisitos funcionais e as regras de comportamento da primeira versão do Number Ops.

A V1 deve ser uma aplicação web funcional executada no navegador, sem backend e sem integração com serviços externos.

---

# 2. Requisitos Funcionais

## RN-001 — Dashboard

O sistema deve possuir uma página inicial com uma visão geral dos números cadastrados.

O dashboard deve apresentar:

- Total de números;
- Total de números ativos;
- Total de números em aquecimento;
- Total de números em análise;
- Total de números bloqueados;
- Total de números inativos.

Os indicadores devem ser atualizados automaticamente conforme os dados forem alterados.

---

## RN-002 — Cadastro de Número

O sistema deve permitir adicionar um novo número.

O cadastro deve possuir, no mínimo:

- Número de telefone;
- Identificação;
- Status;
- Localização;
- Responsável;
- Clientes relacionados;
- Grupos relacionados;
- Observações.

O número de telefone deve ser obrigatório.

O sistema deve impedir o cadastro de números duplicados.

---

## RN-003 — Edição de Número

O sistema deve permitir editar as informações de um número já cadastrado.

As alterações devem ser refletidas imediatamente na interface.

Alterações relevantes devem ser registradas no histórico.

---

## RN-004 — Arquivamento de Número

O sistema deve permitir retirar um número da operação sem necessariamente apagar permanentemente seus dados.

A primeira versão poderá utilizar o status `INACTIVE` para representar números retirados da operação.

O sistema deve preservar o histórico do número arquivado.

---

## RN-005 — Visualização de Número

O sistema deve possuir uma página ou modal de detalhes para cada número.

A visualização deve apresentar:

- Número;
- Identificação;
- Status;
- Localização;
- Responsável;
- Clientes;
- Grupos;
- Observações;
- Data de cadastro;
- Última atualização;
- Histórico;
- Ocorrências.

---

## RN-006 — Status

Cada número deve possuir exatamente um status operacional.

Status disponíveis:

- `ACTIVE` — Ativo;
- `WARMING` — Em aquecimento;
- `UNDER_REVIEW` — Em análise;
- `BLOCKED` — Bloqueado;
- `INACTIVE` — Inativo.

O status deve ser facilmente visualizado na interface.

---

## RN-007 — Alteração de Status

O usuário deve conseguir alterar o status de um número.

Quando o status for alterado, o sistema deve:

1. Atualizar o status atual;
2. Registrar a alteração no histórico;
3. Registrar data e hora;
4. Registrar o status anterior;
5. Registrar o novo status.

---

## RN-008 — Registro de Queda ou Restrição

O sistema deve possuir uma maneira rápida de registrar que um número apresentou uma queda, restrição ou problema operacional.

Ao registrar uma ocorrência desse tipo, o sistema deve:

1. Criar uma ocorrência;
2. Registrar data e hora;
3. Registrar o responsável;
4. Registrar descrição;
5. Alterar o número para `UNDER_REVIEW`, quando essa opção for confirmada;
6. Registrar a alteração no histórico.

---

## RN-009 — Ocorrências

O sistema deve permitir visualizar as ocorrências relacionadas a um número.

Cada ocorrência deve possuir:

- Tipo;
- Data;
- Hora;
- Responsável;
- Descrição;
- Status;
- Data de resolução.

Tipos iniciais:

- Restrição;
- Queda;
- Bloqueio;
- Problema no chip;
- Problema no aparelho;
- Outro.

---

## RN-010 — Resolução de Ocorrência

O sistema deve permitir marcar uma ocorrência como resolvida.

Ao resolver uma ocorrência, deve ser possível registrar:

- Data de resolução;
- Observação da resolução;
- Responsável pela resolução.

---

## RN-011 — Localização

Cada número deve possuir uma localização operacional.

Localizações iniciais:

- Celular 01;
- Celular 02;
- Celular 03;
- Estoque;
- Com funcionário;
- Em manutenção;
- Não localizado.

A estrutura deve permitir adicionar novas localizações futuramente.

---

## RN-012 — Responsável

Cada número poderá possuir um responsável operacional.

O sistema deve permitir visualizar quem é o responsável atual pelo número.

---

## RN-013 — Clientes

Um número poderá estar relacionado a um ou mais clientes.

O sistema deve permitir:

- Adicionar cliente;
- Remover cliente;
- Visualizar clientes relacionados;
- Pesquisar números por cliente.

---

## RN-014 — Grupos

Um número poderá estar relacionado a um ou mais grupos.

O sistema deve permitir:

- Adicionar grupo;
- Remover grupo;
- Visualizar grupos relacionados;
- Pesquisar números por grupo.

O sistema não deve criar, editar ou administrar os grupos do WhatsApp.

Os grupos são apenas informações de relacionamento.

---

## RN-015 — Pesquisa

O sistema deve possuir uma pesquisa de números.

A pesquisa deve permitir localizar informações por:

- Número;
- Identificação;
- Cliente;
- Grupo;
- Responsável;
- Localização.

A pesquisa deve atualizar os resultados sem necessidade de recarregar a página.

---

## RN-016 — Filtros

O sistema deve possuir filtros para os números.

Filtros iniciais:

- Status;
- Localização;
- Cliente;
- Grupo;
- Responsável.

Os filtros devem poder ser utilizados individualmente ou combinados.

---

## RN-017 — Histórico

O sistema deve registrar alterações importantes relacionadas aos números.

Eventos que podem gerar histórico:

- Cadastro;
- Alteração de status;
- Alteração de localização;
- Alteração de responsável;
- Cliente adicionado;
- Cliente removido;
- Grupo adicionado;
- Grupo removido;
- Ocorrência criada;
- Ocorrência resolvida.

Cada evento deve registrar, quando aplicável:

- Tipo;
- Data;
- Hora;
- Descrição;
- Valor anterior;
- Novo valor.

---

## RN-018 — Persistência

Os dados devem permanecer disponíveis após fechar e abrir novamente o navegador.

A primeira versão utilizará armazenamento local.

A camada responsável pelo armazenamento deve ser isolada da interface para permitir futura substituição por uma API/backend.

---

## RN-019 — Dados de Demonstração

O sistema poderá possuir dados fictícios para facilitar desenvolvimento e testes.

Nenhum número real da empresa deve ser incluído no código-fonte ou no repositório público.

---

## RN-020 — Boas Práticas

O sistema deve possuir uma área dedicada a boas práticas relacionadas à operação dos números.

A área deverá organizar informações de forma clara e objetiva.

Categorias iniciais:

- Antes de colocar um número em operação;
- Durante a operação;
- Quando ocorrer uma restrição;
- Durante o período de análise;
- Após a liberação.

As informações devem ser apresentadas como orientações operacionais e não como garantia de evitar bloqueios.

---

# 3. Regras de Negócio

## RB-001

Um número deve possuir apenas um status atual.

---

## RB-002

Um número em `UNDER_REVIEW` não deve ser apresentado como disponível para operação.

---

## RB-003

Um número em `BLOCKED` não deve ser apresentado como disponível para operação.

---

## RB-004

Um número em `INACTIVE` não deve ser apresentado como disponível para operação.

---

## RB-005

Um número pode estar relacionado a vários clientes.

---

## RB-006

Um número pode estar relacionado a vários grupos.

---

## RB-007

Um cliente pode possuir vários números relacionados.

---

## RB-008

Um grupo pode possuir vários números relacionados.

---

## RB-009

O mesmo número não pode ser cadastrado duas vezes.

---

## RB-010

Alterações importantes devem gerar eventos no histórico.

---

## RB-011

Excluir ou arquivar um número não deve apagar automaticamente seu histórico.

---

## RB-012

O sistema deve separar a lógica de armazenamento da lógica da interface.

Isso permitirá migrar futuramente de armazenamento local para backend sem reconstruir completamente a aplicação.

---

# 4. Requisitos de Interface

## RI-001

A interface deve ser simples e rápida para utilização frequente.

---

## RI-002

O status dos números deve possuir diferenciação visual clara.

---

## RI-003

A ação de registrar queda/restrição deve ser facilmente acessível.

---

## RI-004

A busca por número deve estar disponível na tela de gerenciamento.

---

## RI-005

O sistema deve funcionar adequadamente em desktop.

---

## RI-006

A interface deverá ser responsiva para telas menores.

---

## RI-007

A aplicação não deve depender de informações armazenadas diretamente em elementos HTML como fonte principal dos dados.

Os dados devem possuir uma estrutura JavaScript organizada.

---

# 5. Restrições da V1

A V1 não deve possuir:

- Backend;
- Banco MySQL;
- Login;
- Sistema de usuários;
- Integração com ferramentas de disparo de mensagens;
- Integração com ferramentas de atendimento;
- Integrações externas;
- Envio de mensagens;
- Administração de grupos do WhatsApp;
- Automação de disparos.

Esses recursos fazem parte de fases futuras.

---

# 6. Critério Geral de Conclusão da V1

A V1 será considerada funcional quando for possível:

1. Abrir o sistema no navegador;
2. Visualizar o dashboard;
3. Adicionar um número;
4. Editar um número;
5. Alterar seu status;
6. Alterar sua localização;
7. Associar clientes;
8. Associar grupos;
9. Pesquisar números;
10. Filtrar números;
11. Registrar uma ocorrência;
12. Colocar um número em análise;
13. Visualizar o histórico;
14. Arquivar um número;
15. Fechar o navegador;
16. Abrir novamente;
17. Encontrar os dados preservados.