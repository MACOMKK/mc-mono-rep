# Guia: testar o WhatsApp via Evolution API local (Docker + ngrok)

Checklist pra repetir o setup sem se perder. Veja também `supabase/functions/whatsapp-api/README.md`
para a explicação técnica completa dos dois provedores (Meta x Evolution).

## Visão geral do fluxo

```
CRM (Atendimento) ──envio──> crm-api (Supabase, nuvem)
                                  │
                                  ├─ se whatsapp_evolution ATIVA no Console → Evolution API (Docker local, via ngrok)
                                  └─ senão → Meta Cloud API (produção REAL)

WhatsApp (seu celular) ──mensagem──> Evolution API (Docker) ──webhook──> whatsapp-api (Supabase, nuvem)
                                                                              │
                                                                              └─ grava em conversas_atendimento/mensagens_atendimento
```

**Ponto crítico**: se a integração `whatsapp_evolution` estiver **Inativa** no Console, o sistema
cai silenciosamente para a Meta Cloud API real — sem erro nenhum na tela. Ou seja, "parece ter
funcionado" não é prova de que testou a Evolution. Sempre confirmar o status da integração antes
de testar.

## Passo a passo (do zero)

### 1. Subir a Evolution API no Docker

Verificar se já não está rodando antes de criar de novo:

```bash
docker ps -a --filter "name=evolution"
```

Se não existir, subir (imagem oficial mudou de `atendai/evolution-api` para `evoapicloud/evolution-api`):

```bash
docker run -d --name evolution-api -p 8080:8080 \
  -e AUTHENTICATION_API_KEY=<chave-global-escolhida> \
  evoapicloud/evolution-api:latest
```

Confirmar que subiu:

```bash
curl http://localhost:8080
# espera: {"status":200,"message":"Welcome to the Evolution API..."}
```

> Se já existir um container antigo ocupando a porta 8080, usar esse mesmo (`docker start evolution-api`
> se estiver parado) em vez de criar outro — só um pode ocupar a porta 8080 por vez.

A **API Key Global** é o valor de `AUTHENTICATION_API_KEY` do container. Pra ver qual foi usada:

```bash
docker inspect evolution-api --format '{{range .Config.Env}}{{println .}}{{end}}' | grep AUTH
```

### 2. Criar/conectar a instância (número de WhatsApp)

Abrir o Manager no navegador: `http://localhost:8080/manager`

- Entrar com a API Key Global (passo 1).
- Criar uma instância (nome livre, ex.: `whatsapp`) — **anotar esse nome**, é o `instance_name`.
- Escanear o QR code com um número de **teste** (nunca o número comercial real de produção —
  Evolution API é não-oficial e usar o número de produção nela tem risco real de banimento).
- Confirmar status "conectado" no Manager.

### 3. Subir o ngrok (expor o Docker local pra internet)

O Supabase (nuvem) precisa alcançar a Evolution API (sua máquina local) — por isso o túnel.

```bash
ngrok http 8080
```

Copiar a URL pública gerada (muda a cada reinício do ngrok no plano free, ex.:
`https://xxxx.ngrok-free.app`). Confirmar que funciona:

```bash
curl https://xxxx.ngrok-free.app
# mesma resposta do passo 1
```

> Se já tiver um ngrok rodando de antes, só reaproveitar — não precisa abrir um segundo.
> Pra achar a URL ativa sem lembrar: abrir a própria Evolution API local
> (`curl http://localhost:8080`) — o campo `manager` da resposta reflete o host usado na última
> requisição, então abrir a URL do ngrok no navegador e olhar esse campo confirma a URL atual.

### 4. Atualizar a integração no Console (apps/admin → Integrações)

Editar a integração `whatsapp_evolution`:

- **Config** → `instance_url`: a URL do ngrok do passo 3 (com `https://`, sem barra no final)
- **Config** → `instance_name`: o nome da instância do passo 2
- **Segredos** → `api_key`: a API Key Global do passo 1 (**sempre reenviar** — o campo nunca
  mostra o valor salvo, só a data da última atualização; se não lembrar se já está certo, manda
  de novo)
- **Ativa**: marcar o switch como ativo e **Salvar**

> Enquanto `whatsapp_evolution` estiver **Ativa**, ela tem prioridade sobre `whatsapp_meta` —
> todo envio feito pela tela de Atendimento do CRM vai usar a Evolution (Docker local), não a
> Meta real. **Lembrar de desativar depois do teste** se quiser voltar a usar a Meta de produção
> sem precisar trocar mais nada.

### 5. (Só se for testar o recebimento/resposta automática) Configurar o webhook

Pra mensagens que chegam no WhatsApp conectado aparecerem no CRM, a Evolution precisa chamar a
`whatsapp-api` (Supabase) quando chegar mensagem:

No Manager (`http://localhost:8080/manager`) → instância → Webhook:

- URL: `https://<project-ref>.supabase.co/functions/v1/whatsapp-api?token=<webhook_token>`
  (o `webhook_token` é o valor cadastrado nos Segredos da integração `whatsapp_evolution`)
- Evento: `MESSAGES_UPSERT`

### 6. Testar

- **Envio (CRM → WhatsApp)**: abrir `Atendimento` no CRM, escolher/criar uma conversa com o
  número de teste conectado no passo 2, mandar uma mensagem. Confirmar que chegou no celular de
  teste.
- **Recebimento (WhatsApp → CRM)**: mandar uma mensagem do celular de teste pro número conectado.
  Confirmar que aparece em tempo real na tela de Atendimento (exige o passo 5 configurado, e a
  `whatsapp-api` publicada/rodando).

## Erros comuns

| Sintoma | Causa provável |
|---|---|
| Envio "funciona" sem erro, mas a mensagem não chega no número de teste | `whatsapp_evolution` está **Inativa** no Console — o sistema caiu silenciosamente pra Meta real. Confirmar o status antes de testar, não depois. |
| `docker run` falha com "port is already allocated" | Já existe um container usando a porta 8080 (seu ou de outra sessão) — usar `docker ps -a` e reaproveitar em vez de criar outro. |
| `docker run` falha com "pull access denied" pra `atendai/evolution-api` | Imagem mudou de nome — usar `evoapicloud/evolution-api`. |
| ngrok dá URL, mas a Evolution não responde por ela | Túnel antigo ainda configurado no Console (`instance_url` desatualizada) — toda vez que o ngrok reinicia, a URL muda e precisa atualizar a integração de novo (passo 4). |
