# CRM

CRM comercial automotivo do monorepo MACOM.

## Desenvolvimento

Na raiz do monorepo, execute:

```bash
npm run dev:crm
```

O app abre em `http://localhost:5172/`.

## Arquitetura

- autenticacao compartilhada pelo Supabase Auth;
- autorizacao pelo acesso ativo ao sistema `crm`;
- frontend consumindo a Edge Function `crm-api`;
- dados persistidos no schema `gestao_crm`;
- migrations em `supabase/migrations`;
- contrato do banco em `apps/crm/supabase/schema.sql`.

Toda leitura e gravacao de dados passa pela `crm-api` e pelo Supabase.
