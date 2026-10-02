# Schema `gestao_ativos`

> Gerado por `npm run docs:db`. [Voltar ao índice](README.md)

12 tabelas. Tabelas de fora (prefixadas com o schema): `auth.users`, `public.colaboradores`, `public.sistemas`, `public.unidades`.

```mermaid
erDiagram
  assinaturas_termo_posse {
    uuid id PK
    uuid termo_id FK
    uuid colaborador_id FK
  }
  ativos {
    uuid id PK
    uuid usuario_id FK
    uuid unidade_id FK
  }
  ativos_historico_posse {
    uuid id PK
    uuid ativo_id FK
    uuid colaborador_anterior_id FK
    uuid colaborador_novo_id FK
    uuid alterado_por FK
  }
  contatos {
    uuid id PK
    uuid unidade_id FK
  }
  contratos_documentos {
    uuid id PK
    uuid sistema_id FK
    uuid unidade_id FK
    uuid responsavel_colaborador_id FK
    uuid criado_por FK
  }
  infra_estrutura {
    uuid id PK
    uuid unidade_id FK
  }
  linhas_corporativas {
    uuid id PK
    uuid unidade_id FK
    uuid colaborador_id FK
  }
  logs_auditoria {
    uuid id PK
    uuid responsavel_colaborador_id FK
  }
  patrimonio_sequencias {
    text categoria PK
  }
  permissoes_central {
    uuid id PK
  }
  permissoes_central_nivel {
    uuid id PK
  }
  termos_posse {
    uuid id PK
    uuid ativo_id FK
    uuid colaborador_id FK
    uuid gerado_por FK
  }
  assinaturas_termo_posse }o--|| termos_posse : "termo_id"
  assinaturas_termo_posse }o--|| public-colaboradores : "colaborador_id"
  ativos }o--o| auth-users : "usuario_id"
  ativos }o--o| public-unidades : "unidade_id"
  ativos_historico_posse }o--|| ativos : "ativo_id"
  ativos_historico_posse }o--o| public-colaboradores : "colaborador_anterior_id"
  ativos_historico_posse }o--o| public-colaboradores : "colaborador_novo_id"
  ativos_historico_posse }o--o| auth-users : "alterado_por"
  contatos }o--o| public-unidades : "unidade_id"
  contratos_documentos }o--o| public-sistemas : "sistema_id"
  contratos_documentos }o--o| public-unidades : "unidade_id"
  contratos_documentos }o--o| public-colaboradores : "responsavel_colaborador_id"
  contratos_documentos }o--o| public-colaboradores : "criado_por"
  infra_estrutura }o--|| public-unidades : "unidade_id"
  linhas_corporativas }o--o| public-unidades : "unidade_id"
  linhas_corporativas }o--o| public-colaboradores : "colaborador_id"
  logs_auditoria }o--o| public-colaboradores : "responsavel_colaborador_id"
  termos_posse }o--o| ativos : "ativo_id"
  termos_posse }o--o| public-colaboradores : "colaborador_id"
  termos_posse }o--o| auth-users : "gerado_por"
```
