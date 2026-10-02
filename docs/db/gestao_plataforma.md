# Schema `gestao_plataforma`

> Gerado por `npm run docs:db`. [Voltar ao índice](README.md)

4 tabelas. Tabelas de fora (prefixadas com o schema): `auth.users`, `public.colaboradores`, `public.sistemas`.

```mermaid
erDiagram
  alertas_seguranca_enviados {
    uuid id PK
  }
  bloqueios_login {
    uuid usuario_id PK,FK
  }
  logs_acesso {
    uuid id PK
    uuid colaborador_id FK
    uuid sistema_id FK
  }
  logs_auditoria {
    uuid id PK
    uuid responsavel_colaborador_id FK
  }
  bloqueios_login |o--|| auth-users : "usuario_id"
  logs_acesso }o--o| public-colaboradores : "colaborador_id"
  logs_acesso }o--|| public-sistemas : "sistema_id"
  logs_auditoria }o--o| public-colaboradores : "responsavel_colaborador_id"
```
