# Number Ops

Sistema web para gerenciamento operacional de números e chips utilizados por empresas (atendimento, campanhas e operações de WhatsApp).

Centraliza, em um só lugar:

- Status de cada número (Ativo, Em aquecimento, Em análise, Bloqueado, Inativo) e sua utilização (Em uso / Disponível / Indisponível);
- Localização (aparelho), colaborador responsável, clientes e squads relacionados;
- Campanhas e o papel de cada número nelas (Principal, Backup, Apoio);
- Ocorrências, restrições operacionais e histórico de cada número;
- Usuários, níveis de acesso e Registro de atividades (auditoria).

## Como executar

Requisito único: **Python 3.10 ou mais recente** (não há `pip install`, só a biblioteca padrão).

```bash
python server.py               # abre em http://127.0.0.1:8000
python server.py --seed-demo   # mesma coisa, inserindo dados fictícios de demonstração
python server.py --open        # abre o navegador automaticamente
python server.py --backup      # copia o banco para data/backups/ e sai
```

No primeiro acesso, a tela **Configurar o Number Ops** cria a conta **MASTER** (nome, e-mail, CPF e senha forte).

Testes automatizados do backend:

```bash
python -m unittest discover -s tests -v
```

## Arquitetura

```text
number-ops/
├── server.py              # ponto de entrada (argumentos de linha de comando)
├── backend/               # servidor Python (somente biblioteca padrão)
│   ├── http_app.py        # rotas da API JSON, sessão, CSRF, cabeçalhos de segurança, arquivos estáticos
│   ├── database.py        # esquema SQLite (CHECKs, FKs, índices únicos) e backup
│   ├── state.py           # validação e gravação dos dados operacionais + permissões por nível
│   ├── accounts.py        # login, sessões, solicitações de acesso, usuários
│   ├── security.py        # hash de senha, política de senha, CPF, limitação de tentativas
│   ├── audit.py           # Registro de atividades
│   └── demo.py            # dados fictícios de demonstração
├── data/                  # criado na primeira execução (fora do git)
│   ├── number_ops.db      # banco SQLite
│   ├── secret.key         # chave do HMAC do CPF — faça backup junto com o banco
│   └── backups/
├── index.html             # frontend (HTML/CSS/JavaScript puro, ES Modules)
├── src/
└── tests/test_backend.py
```

O navegador mantém o estado em memória e envia ao servidor apenas os registros alterados (`POST /api/state/sync`). **O servidor é a fronteira de confiança**: valida cada campo, aplica as permissões do nível de acesso e grava tudo numa transação única, registrando a auditoria.

## Regras de negócio principais

- **Chip inativo é arquivado automaticamente.** Ao marcar um número como *Inativo* (ou cadastrá-lo assim), ele é arquivado e encerra seus vínculos ativos com campanhas. A regra está no frontend, no servidor e no próprio banco (`CHECK`).
- Número arquivado ou com restrição *Sem área* não pode entrar em campanha; campanha encerrada encerra os vínculos.
- Um número pode estar em várias campanhas ao mesmo tempo, mas só uma vez ativo em cada uma.
- Histórico de cada número é imutável; o Registro de atividades é somente-inserção (o banco bloqueia `UPDATE`/`DELETE`).

## Acesso e segurança

**Cadastro com aprovação.** Quem não tem conta usa *Solicitar acesso* (nome, e-mail, CPF, cargo e senha). A solicitação aparece para o MASTER em **Usuários → Solicitações de acesso** (com contador no menu e aviso na tela), que aprova escolhendo nível de acesso e Squad, ou recusa.

**CPF.** Validado pelos dígitos verificadores. Cada CPF só pode ter **uma conta ou uma solicitação pendente**: um segundo envio com o mesmo CPF (ou e-mail) é recusado na hora. O CPF não é guardado em texto puro: só um HMAC-SHA256 (para detectar duplicidade) e uma versão mascarada (`***.456.789-**`) para exibição.

**Senha forte** (validada no navegador e no servidor): mínimo de 8 caracteres, letra maiúscula, minúscula, número e caractere especial, sem espaços, sem 3 caracteres iguais seguidos, sem conter o nome/e-mail e fora de uma lista de senhas comuns.

Demais proteções:

- Senhas com hash PBKDF2-SHA256 (600 000 iterações, salt aleatório).
- Sessão em cookie `HttpOnly` + `SameSite=Strict`, expira após 4 h sem uso (12 h no máximo); o token é guardado no banco apenas como hash.
- Proteção CSRF: token por sessão + cabeçalho próprio + checagem de `Origin`.
- Login bloqueado por 15 minutos após 5 erros no mesmo e-mail (e limite por IP); limite de solicitações de acesso por IP.
- Mensagem genérica de login inválido (não revela se o e-mail existe).
- Desativar um usuário ou mudar seu nível de acesso derruba as sessões dele imediatamente.
- *Esqueci minha senha*: o MASTER usa **Redefinir senha**, que gera uma senha temporária; o usuário é obrigado a criar uma nova no próximo login.
- Cabeçalhos `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options` e `Referrer-Policy`; o servidor só entrega `index.html`, `manifest.json` e `src/` (nunca `backend/` ou `data/`).
- Por padrão o servidor escuta só em `127.0.0.1`. Para expor na rede, use `--host 0.0.0.0` **apenas em rede confiável** (é HTTP, sem criptografia).

**Níveis de acesso:** `MASTER` > `ADMIN` > `USER` > `VIEWER`.

| Ação | MASTER | ADMIN | USER | VIEWER |
| --- | :-: | :-: | :-: | :-: |
| Consultar tudo | ✓ | ✓ | ✓ | ✓ |
| Números, campanhas, ocorrências | ✓ | ✓ | ✓ | |
| Clientes, squads, colaboradores, localizações | ✓ | ✓ | | |
| Editar usuários / Registro de atividades | ✓ | ✓ | | |
| Aprovar acessos, mudar nível, redefinir senha, excluir definitivamente, restaurar backup | ✓ | | | |

## Backup

- **Dados e Backup → Exportar** baixa um JSON com todos os dados operacionais.
- **Importar** (somente MASTER) valida o arquivo e substitui a base; antes, o servidor salva uma cópia do banco em `data/backups/`.
- `python server.py --backup` copia o banco inteiro (inclui usuários). Guarde junto o arquivo `data/secret.key`.

## Tecnologias

- Python 3 (biblioteca padrão: `http.server`, `sqlite3`, `hashlib`, `hmac`, `secrets`)
- SQLite
- HTML5, CSS3 e JavaScript (ES Modules), sem frameworks nem build
