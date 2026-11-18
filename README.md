<div align="center">

# CarlosCostaPrev — Sistema Integrado de Gestão

**CRM open source com agentes de IA no WhatsApp e módulo previdenciário, rodando no seu próprio servidor.**
Sem mensalidade, sem recurso travado, com os dados na sua mão.

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%2BAuth%2BStorage-3ecf8e?logo=supabase)](https://supabase.com)
[![Self-hosted](https://img.shields.io/badge/self--hosted-VPS%20HostGator%20ou%20Hostinger-orange)](hostgator-setup-kit/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[**Instalar**](#instalar-na-sua-vps) · [**Atualizar**](#atualizar) · [**Visão**](VISION.md) · [**Arquitetura**](ARCHITECTURE.md) · [**Contribuir**](CONTRIBUTING.md)

</div>

---

## O que é

O CarlosCostaPrev é um sistema de gestão para escritório: **funil de vendas, caixa de entrada do WhatsApp,
contatos, agentes de IA que atendem e qualificam, automações e relatórios**, tudo num servidor seu.

Na camada do escritório, ele traz o **módulo previdenciário**:

- **Casos previdenciários** em quadro por etapa, com pendências, prazos, documentos e histórico.
- **Base de conhecimento** com patologias (CID e CIF), o instrumento IFBrA e a matriz legislativa,
  sempre sob revisão profissional.
- Telas e textos em português, com espanhol disponível.

É open source (licença MIT) e **pode ser instalado em VPS da HostGator, da Hostinger ou de qualquer
hospedagem com Docker**.

---

## Instalar na sua VPS

### Onde instalar

| Hospedagem | Como o instalador se comporta |
|---|---|
| **HostGator (VPS)** | Caminho direto: o instalador sobe o app com HTTPS automático (Caddy). |
| **Hostinger (VPS)** | Funciona. A Hostinger já traz um proxy reverso próprio nas portas 80 e 443; o instalador **detecta isso** e publica o sistema por trás dele. Quando o proxy usa `--network host`, ele **pergunta** em vez de adivinhar. |
| **Outra VPS com Docker** (Coolify, Dokploy, CapRover, Oracle Ampere A1…) | Funciona pelo mesmo caminho. Há suporte a ARM64. |

Mínimo recomendado: **4 GB de RAM**.

### 1. Entre na VPS

No seu computador, abra o Terminal (no Windows, o PowerShell) e conecte com o IP que a hospedagem enviou:

```bash
ssh -p PORTA root@SEU_IP
```

Se a hospedagem não informou porta, é a 22 e você pode omitir `-p PORTA`. Ao digitar a senha **não aparece
nada na tela**: é normal.

### 2. Rode o instalador

Já dentro da VPS:

```bash
git clone https://github.com/carlosrogeriocosta-carloscostaprev/CarlosCostaPrev-Sistema.git
cd CarlosCostaPrev-Sistema
REPO_URL=https://github.com/carlosrogeriocosta-carloscostaprev/CarlosCostaPrev-Sistema.git bash hostgator-setup-kit/install.sh
```

Você **não instala Node nem pnpm e não compila nada**: a imagem do app já vem pronta. Se faltar Docker,
o instalador pergunta e instala.

> **Repositório privado.** Se o repositório estiver privado, o `git clone` precisa de acesso (chave SSH
> ou token). Sem isso, ele pede usuário e senha e recusa.
>
> **Por que o `REPO_URL`.** O instalador, sem ele, aponta para o repositório do projeto original. Passar o
> endereço do seu garante que o sistema instalado venha **deste** repositório.

### O que você precisa ter em mãos

| Item | Onde conseguir |
|---|---|
| **VPS com Docker** | HostGator ou Hostinger (ou outra). 4 GB de RAM recomendados |
| **Domínio** | Um registro **A** apontando para o IP da VPS (ex.: `sistema.seudominio.com.br`) |
| **Banco** | Conta grátis no [supabase.com](https://supabase.com): 3 chaves e a *connection string* do **Session pooler**. Se o projeto ficar fora do ar (`522` ou `PGRST002` por horas), veja o [runbook de custo e cota](docs/runbooks/custo-e-cota-do-supabase.md) |
| **IA** | Uma chave de **OpenRouter**, **Anthropic** ou **OpenAI** (o instalador pergunta qual) |
| **WhatsApp** | Seu número, conectado por QR code no onboarding |

### O que o instalador faz por você

Ele pergunta só o que é seu (domínio, chaves, senha do admin), **valida cada resposta antes de seguir** e:

1. Gera os segredos técnicos sozinho.
2. Cria as extensões do Postgres e aplica o schema completo (`supabase/baseline.sql`).
3. Cria o primeiro administrador.
4. Sobe a stack inteira com HTTPS e confere a saúde no fim.
5. Instala o cron das automações e o agente de atualização.

Rodar de novo não quebra nada: o `install.sh` é idempotente.

Modo sem perguntas: copie `.env.hostgator.example` para `.env`, preencha e rode
`bash hostgator-setup-kit/install.sh --yes`.

### Na Hostinger (ou outra VPS com proxy próprio)

Depois de instalado, **todo** `up -d` leva os dois arquivos de compose. Sem o segundo, o contêiner volta sem as
regras de roteamento e o domínio inteiro responde `404`:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.traefik.yml --env-file .env up -d app
```

Para conferir um deploy: `/` responde **200** e `/app` responde **307**. Detalhes e outros casos de proxy em
[`hostgator-setup-kit/README.md`](hostgator-setup-kit/README.md) e em
[`docs/runbooks/deploy.md`](docs/runbooks/deploy.md).

### Primeiro acesso

Abra `https://<seu-domínio>` (o cadeado leva cerca de 1 minuto), entre com o administrador e, no onboarding,
escaneie o QR code com o WhatsApp do número. A verificação em duas etapas é **opcional** e fica em
Configurações › Segurança.

---

## Atualizar

> **Atenção: em ajuste.** O endereço de atualização do kit (`update.sh` e o botão "Atualizar agora") ainda
> aponta para o repositório do projeto original, não para este. **Enquanto isso não for corrigido, não rode
> `update.sh` nem use o botão** em uma instalação com a camada previdenciária: a atualização traria o código do
> projeto original e removeria o que é nosso. Está registrado em
> [`docs/CAMADA-CARLOSCOSTAPREV.md`](docs/CAMADA-CARLOSCOSTAPREV.md).

Quando o endereço estiver acertado, a atualização pelo terminal será:

```bash
cd /caminho/do/CarlosCostaPrev-Sistema
bash hostgator-setup-kit/update.sh
```

Ela confere se há versão nova, **faz backup do banco antes de qualquer mudança**, baixa o código, reaplica o
`baseline.sql` (idempotente) e confere a saúde no fim. Passo a passo em [`docs/ATUALIZANDO.md`](docs/ATUALIZANDO.md).

### Outros comandos do kit

| Script | Função |
|---|---|
| `install.sh` | Instala tudo (idempotente) |
| `update.sh` | Atualiza para a versão nova, com backup automático |
| `backup.sh` | Backup do banco e das sessões de WhatsApp |
| `restore.sh` | Restaura um backup (só em banco vazio) |
| `reset-password.sh` | Redefine a senha de um usuário |
| `reset-mfa.sh` | Remove a verificação em duas etapas de quem perdeu o celular |
| `healthcheck.sh` | Diagnóstico: sai 0 só quando o app se declara saudável |

---

## Desenvolvimento local

> Se você quer **usar** o sistema, não é aqui: use o [instalador da VPS](#instalar-na-sua-vps).
> Esta seção é para quem vai mexer no código.

Requisitos: Node 22, pnpm e Docker.

```bash
git clone https://github.com/carlosrogeriocosta-carloscostaprev/CarlosCostaPrev-Sistema.git
cd CarlosCostaPrev-Sistema

nvm use                     # Node 22
npm install -g pnpm && pnpm install

cp .env.example .env.local  # guia completo em docs/SETUP.md

docker compose up -d        # WAHA local (opcional em dev sem WhatsApp)

# Schema: aplique o baseline, NÃO as migrations.
# As migrations 0001-0009 e 0013 são stubs `SELECT 1;` — a cadeia não sobe do zero.
# O schema real vive no baseline.sql, o mesmo que o install.sh aplica na VPS.
# `supabase db push` "passa" e deixa o banco vazio.
supabase link --project-ref <seu-ref>

# Num projeto Supabase NOVO, habilite antes as extensões que o schema usa —
# sem elas o baseline para em `type public.vector does not exist`.
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -c \
  'create extension if not exists vector with schema public;
   create extension if not exists citext with schema public;
   create extension if not exists pg_trgm with schema public;'

psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/baseline.sql

pnpm dev                    # http://localhost:3000
pnpm worker                 # agent-worker, em outro terminal
```

Health check: <http://localhost:3000/api/v1/health>. Testes:

```bash
pnpm typecheck
pnpm lint
pnpm test:unit    # sem caminho: alcança o repositório inteiro
pnpm test:db      # Postgres efêmero + invariantes de isolamento entre organizações
pnpm test:e2e     # Playwright
```

---

## Documentação

| Documento | Conteúdo |
|---|---|
| [`VISION.md`](VISION.md) | O que o produto é e o que não é |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Arquitetura |
| [`docs/CAMADA-CARLOSCOSTAPREV.md`](docs/CAMADA-CARLOSCOSTAPREV.md) | O que o escritório acrescentou sobre a base: módulo previdenciário, decisões e pendências |
| [`docs/index.md`](docs/index.md) | Índice dos demais documentos |
| [`hostgator-setup-kit/README.md`](hostgator-setup-kit/README.md) | Instalação self-host: scripts e hospedagens com proxy próprio |
| [`docs/runbooks/deploy.md`](docs/runbooks/deploy.md) | Deploy em produção |
| [`docs/runbooks/waha-hostgator.md`](docs/runbooks/waha-hostgator.md) | WhatsApp (WAHA) em produção |
| [`SECURITY.md`](SECURITY.md) | Segurança |
| [`CHANGELOG.md`](CHANGELOG.md) | Histórico de versões |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Como contribuir |

---

## Licença

MIT. Veja [`LICENSE`](LICENSE), que mantém o aviso de copyright do projeto original, como a própria licença
exige para quem reutiliza o código.
