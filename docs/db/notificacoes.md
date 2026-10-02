# Schema `notificacoes`

> Gerado por `npm run docs:db`. [Voltar ao índice](README.md)

2 tabelas. Tabelas de fora (prefixadas com o schema): `public.colaboradores`.

```mermaid
erDiagram
  fila_emails {
    uuid id PK
  }
  notificacoes {
    uuid id PK
    uuid colaborador_id FK
    uuid criado_por FK
  }
  notificacoes }o--|| public-colaboradores : "colaborador_id"
  notificacoes }o--o| public-colaboradores : "criado_por"
```
