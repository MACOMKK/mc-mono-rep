export const CRM_SCHEMA = 'gestao_crm';

export type EntityName = 'clientes' | 'leads' | 'atendimentos' | 'historico_atendimentos' | 'veiculos_interesse' | 'categorias_veiculo' | 'origens_lead';

export function getAccessLevel(access: Record<string, unknown> | null) {
  return String(access?.nivel_acesso || '');
}

function unimplementedScopeError(entity: string) {
  return Object.assign(
    new Error(`Escopo de acesso nao implementado para a entidade "${entity}".`),
    { status: 403 },
  );
}

export function buildAccessScope(
  entity: EntityName,
  access: Record<string, unknown> | null,
  collaborator: Record<string, unknown> | null,
  startIndex: number,
) {
  const level = getAccessLevel(access);
  if (level === 'admin') return { clause: '', values: [] as unknown[] };

  const collaboratorId = String(collaborator?.id || '');
  const unitId = String(collaborator?.unidade_id || '');
  if (!collaboratorId) {
    throw Object.assign(new Error('Colaborador nao identificado.'), { status: 403 });
  }

  if (level === 'gestor') {
    if (!unitId) {
      throw Object.assign(new Error('Gestor sem unidade vinculada.'), { status: 403 });
    }
    switch (entity) {
      case 'leads':
      case 'atendimentos':
        return { clause: `l."unidade_id" = $${startIndex}`, values: [unitId] };
      case 'clientes':
        return {
          clause: `(
            "criado_por" = $${startIndex + 1}
            or exists (
              select 1 from ${CRM_SCHEMA}.leads scope_lead
              where scope_lead.cliente_id = clientes.id
                and scope_lead.unidade_id = $${startIndex}
            )
          )`,
          values: [unitId, collaboratorId],
        };
      case 'historico_atendimentos':
        return {
          clause: `(
            exists (
              select 1 from ${CRM_SCHEMA}.leads scope_lead
              where scope_lead.id = historico_atendimentos.lead_id
                and scope_lead.unidade_id = $${startIndex}
            )
            or exists (
              select 1 from ${CRM_SCHEMA}.leads scope_lead
              where scope_lead.cliente_id = historico_atendimentos.cliente_id
                and scope_lead.unidade_id = $${startIndex}
            )
          )`,
          values: [unitId],
        };
      case 'veiculos_interesse':
        return {
          clause: `exists (
            select 1 from ${CRM_SCHEMA}.leads scope_lead
            where scope_lead.id = veiculos_interesse.lead_id
              and scope_lead.unidade_id = $${startIndex}
          )`,
          values: [unitId],
        };
      case 'categorias_veiculo':
      case 'origens_lead':
        return { clause: '', values: [] as unknown[] };
      default:
        throw unimplementedScopeError(entity);
    }
  }

  switch (entity) {
    case 'leads':
      return {
        clause: `(l."responsavel_id" = $${startIndex} or l."criado_por" = $${startIndex})`,
        values: [collaboratorId],
      };
    case 'atendimentos':
      return {
        clause: `(l."responsavel_id" = $${startIndex} or a."criado_por" = $${startIndex})`,
        values: [collaboratorId],
      };
    case 'clientes':
      return {
        clause: `(
          "criado_por" = $${startIndex}
          or exists (
            select 1 from ${CRM_SCHEMA}.leads scope_lead
            where scope_lead.cliente_id = clientes.id
              and (scope_lead.responsavel_id = $${startIndex} or scope_lead.criado_por = $${startIndex})
          )
        )`,
        values: [collaboratorId],
      };
    case 'historico_atendimentos':
      return {
        clause: `(
          exists (
            select 1 from ${CRM_SCHEMA}.leads scope_lead
            where scope_lead.id = historico_atendimentos.lead_id
              and (scope_lead.responsavel_id = $${startIndex} or scope_lead.criado_por = $${startIndex})
          )
          or exists (
            select 1 from ${CRM_SCHEMA}.leads scope_lead
            where scope_lead.cliente_id = historico_atendimentos.cliente_id
              and (scope_lead.responsavel_id = $${startIndex} or scope_lead.criado_por = $${startIndex})
          )
        )`,
        values: [collaboratorId],
      };
    case 'veiculos_interesse':
      return {
        clause: `exists (
          select 1 from ${CRM_SCHEMA}.leads scope_lead
          where scope_lead.id = veiculos_interesse.lead_id
            and (scope_lead.responsavel_id = $${startIndex} or scope_lead.criado_por = $${startIndex})
        )`,
        values: [collaboratorId],
      };
    case 'categorias_veiculo':
    case 'origens_lead':
      return { clause: '', values: [] as unknown[] };
    default:
      throw unimplementedScopeError(entity);
  }
}

export function applyCreateScope(
  entity: EntityName,
  payload: Record<string, unknown>,
  access: Record<string, unknown> | null,
  collaborator: Record<string, unknown> | null,
) {
  // Defesa em profundidade: mesmo que allowedFields de index.ts ja bloqueie esses campos
  // para entidades que nao sejam leads, o proprio helper de escopo nunca deve confiar
  // neles vindos do payload do cliente. criado_por e sempre setado explicitamente pelo
  // chamador (so no create, nunca no update), nunca aceito do payload.
  delete payload.criado_por;
  if (entity !== 'leads') {
    delete payload.unidade_id;
    delete payload.responsavel_id;
  }

  const level = getAccessLevel(access);
  if (level === 'admin') return payload;

  const collaboratorId = String(collaborator?.id || '');
  const unitId = String(collaborator?.unidade_id || '');

  if (entity === 'leads') {
    if (!unitId) throw Object.assign(new Error('Usuario sem unidade vinculada.'), { status: 403 });
    payload.unidade_id = unitId;
    if (level === 'usuario') {
      payload.responsavel_id = collaboratorId;
    }
  }

  return payload;
}

export function ensureCanManage(access: Record<string, unknown> | null) {
  if (!access || !['admin', 'gestor', 'usuario'].includes(String(access.nivel_acesso || ''))) {
    throw Object.assign(new Error('Seu usuario nao possui acesso liberado ao CRM.'), { status: 403 });
  }
}

export function ensureCanConfigure(access: Record<string, unknown> | null) {
  if (!access || !['admin', 'gestor'].includes(String(access.nivel_acesso || ''))) {
    throw Object.assign(new Error('Apenas administradores e gestores podem configurar a distribuicao.'), { status: 403 });
  }
}
