# Schema `gestao_servicos`

> Gerado por `npm run docs:db`. [Voltar ao índice](README.md)

15 tabelas. Tabelas de fora (prefixadas com o schema): `public.clientes`, `public.colaboradores`, `public.departamentos`, `public.empresas`, `public.unidades`, `public.veiculos`.

```mermaid
erDiagram
  anexos_solicitacao {
    uuid id PK
    uuid solicitacao_id FK
    uuid parcela_id FK
    uuid criado_por FK
  }
  assinaturas_anexo {
    uuid id PK
    uuid anexo_id FK
    uuid colaborador_id FK
  }
  categorias {
    uuid id PK
    uuid criado_por FK
  }
  checklist_avaliacoes {
    uuid id PK
    uuid colaborador_id FK
    uuid cliente_id FK
    uuid veiculo_id FK
    uuid unidade_id FK
  }
  checklist_avarias {
    uuid id PK
    uuid avaliacao_id FK
  }
  checklist_fotos {
    uuid id PK
    uuid avaliacao_id FK
    uuid avaria_id FK
  }
  checklist_itens {
    uuid id PK
    uuid avaliacao_id FK
  }
  configuracoes_modulo {
    uuid id PK
    uuid atualizado_por FK
  }
  fornecedores {
    uuid id PK
    uuid criado_por FK
  }
  historico_checklist {
    uuid id PK
    uuid autor_id FK
  }
  historico_solicitacao {
    uuid id PK
    uuid solicitacao_id FK
    uuid autor_id FK
  }
  notificacoes {
    uuid id PK
    uuid colaborador_id FK
    uuid criado_por FK
  }
  parcelas_pagamento {
    uuid id PK
    uuid solicitacao_id FK
    uuid pago_por FK
  }
  permissoes_modulo {
    uuid id PK
    uuid colaborador_id FK
    uuid criado_por FK
  }
  solicitacoes_pagamento {
    uuid id PK
    uuid solicitante_id FK
    uuid analisado_por FK
    uuid pago_por FK
    uuid criado_por FK
    uuid empresa_id FK
    uuid departamento_id FK
    uuid aprovador_destino_id FK
    uuid fornecedor_id FK
    uuid categoria_id FK
    uuid pendencia_aberta_por FK
    uuid unidade_id FK
    uuid colaborador_beneficiario_id FK
  }
  anexos_solicitacao }o--|| solicitacoes_pagamento : "solicitacao_id"
  anexos_solicitacao }o--o| parcelas_pagamento : "parcela_id"
  anexos_solicitacao }o--o| public-colaboradores : "criado_por"
  assinaturas_anexo }o--|| anexos_solicitacao : "anexo_id"
  assinaturas_anexo }o--|| public-colaboradores : "colaborador_id"
  categorias }o--o| public-colaboradores : "criado_por"
  checklist_avaliacoes }o--|| public-colaboradores : "colaborador_id"
  checklist_avaliacoes }o--o| public-clientes : "cliente_id"
  checklist_avaliacoes }o--|| public-veiculos : "veiculo_id"
  checklist_avaliacoes }o--|| public-unidades : "unidade_id"
  checklist_avarias }o--|| checklist_avaliacoes : "avaliacao_id"
  checklist_fotos }o--|| checklist_avaliacoes : "avaliacao_id"
  checklist_fotos }o--o| checklist_avarias : "avaria_id"
  checklist_itens }o--|| checklist_avaliacoes : "avaliacao_id"
  configuracoes_modulo }o--o| public-colaboradores : "atualizado_por"
  fornecedores }o--o| public-colaboradores : "criado_por"
  historico_checklist }o--o| public-colaboradores : "autor_id"
  historico_solicitacao }o--|| solicitacoes_pagamento : "solicitacao_id"
  historico_solicitacao }o--o| public-colaboradores : "autor_id"
  notificacoes }o--|| public-colaboradores : "colaborador_id"
  notificacoes }o--o| public-colaboradores : "criado_por"
  parcelas_pagamento }o--|| solicitacoes_pagamento : "solicitacao_id"
  parcelas_pagamento }o--o| public-colaboradores : "pago_por"
  permissoes_modulo }o--|| public-colaboradores : "colaborador_id"
  permissoes_modulo }o--o| public-colaboradores : "criado_por"
  solicitacoes_pagamento }o--|| public-colaboradores : "solicitante_id"
  solicitacoes_pagamento }o--o| public-colaboradores : "analisado_por"
  solicitacoes_pagamento }o--o| public-colaboradores : "pago_por"
  solicitacoes_pagamento }o--o| public-colaboradores : "criado_por"
  solicitacoes_pagamento }o--o| public-empresas : "empresa_id"
  solicitacoes_pagamento }o--o| public-departamentos : "departamento_id"
  solicitacoes_pagamento }o--o| public-colaboradores : "aprovador_destino_id"
  solicitacoes_pagamento }o--o| fornecedores : "fornecedor_id"
  solicitacoes_pagamento }o--|| categorias : "categoria_id"
  solicitacoes_pagamento }o--o| public-colaboradores : "pendencia_aberta_por"
  solicitacoes_pagamento }o--o| public-unidades : "unidade_id"
  solicitacoes_pagamento }o--o| public-colaboradores : "colaborador_beneficiario_id"
```
