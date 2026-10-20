import { describe, expect, it } from 'vitest';
import {
  applyCreateScope,
  buildAccessScope,
  ensureCanConfigure,
  ensureCanManage,
  getAccessLevel,
} from '../../../../supabase/functions/crm-api/access-scope.ts';

const collaborator = { id: 'colab-1', unidade_id: 'unidade-1' };

describe('getAccessLevel', () => {
  it('reads nivel_acesso from the access record', () => {
    expect(getAccessLevel({ nivel_acesso: 'admin' })).toBe('admin');
  });

  it('returns an empty string when access is null', () => {
    expect(getAccessLevel(null)).toBe('');
  });
});

describe('buildAccessScope', () => {
  it('admin gets no scoping clause on any entity', () => {
    for (const entity of ['leads', 'clientes', 'atendimentos', 'historico_atendimentos', 'veiculos_interesse']) {
      const scope = buildAccessScope(entity, { nivel_acesso: 'admin' }, collaborator, 2);
      expect(scope).toEqual({ clause: '', values: [] });
    }
  });

  it('gestor scopes leads and atendimentos by unidade_id', () => {
    const access = { nivel_acesso: 'gestor' };
    expect(buildAccessScope('leads', access, collaborator, 2)).toEqual({
      clause: 'l."unidade_id" = $2',
      values: ['unidade-1'],
    });
    expect(buildAccessScope('atendimentos', access, collaborator, 2)).toEqual({
      clause: 'l."unidade_id" = $2',
      values: ['unidade-1'],
    });
  });

  it('gestor scopes clientes, historico_atendimentos and veiculos_interesse by unidade_id', () => {
    const access = { nivel_acesso: 'gestor' };
    expect(buildAccessScope('clientes', access, collaborator, 2).values).toEqual(['unidade-1', 'colab-1']);
    expect(buildAccessScope('historico_atendimentos', access, collaborator, 2).values).toEqual(['unidade-1']);
    expect(buildAccessScope('veiculos_interesse', access, collaborator, 2).values).toEqual(['unidade-1']);
  });

  it('gestor without unidade_id throws a 403', () => {
    const access = { nivel_acesso: 'gestor' };
    expect(() => buildAccessScope('leads', access, { id: 'colab-1' }, 2))
      .toThrowError(expect.objectContaining({ message: 'Gestor sem unidade vinculada.', status: 403 }));
  });

  it('usuario scopes leads by responsavel_id or criado_por', () => {
    const access = { nivel_acesso: 'usuario' };
    expect(buildAccessScope('leads', access, collaborator, 3)).toEqual({
      clause: '(l."responsavel_id" = $3 or l."criado_por" = $3)',
      values: ['colab-1'],
    });
  });

  it('usuario scopes clientes, historico_atendimentos and veiculos_interesse by responsavel_id/criado_por', () => {
    const access = { nivel_acesso: 'usuario' };
    expect(buildAccessScope('clientes', access, collaborator, 3).values).toEqual(['colab-1']);
    expect(buildAccessScope('historico_atendimentos', access, collaborator, 3).values).toEqual(['colab-1']);
    expect(buildAccessScope('veiculos_interesse', access, collaborator, 3).values).toEqual(['colab-1']);
  });

  it('missing collaborator id throws a 403 regardless of level', () => {
    const access = { nivel_acesso: 'usuario' };
    expect(() => buildAccessScope('leads', access, {}, 2))
      .toThrowError(expect.objectContaining({ message: 'Colaborador nao identificado.', status: 403 }));
  });

  it('unknown entity fails closed (throws) instead of returning an unscoped clause', () => {
    const access = { nivel_acesso: 'usuario' };
    expect(() => buildAccessScope('unknown_entity', access, collaborator, 2)).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
  });

  it('unknown entity fails closed for gestor as well', () => {
    const access = { nivel_acesso: 'gestor' };
    expect(() => buildAccessScope('unknown_entity', access, collaborator, 2)).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
  });
});

describe('applyCreateScope', () => {
  it('admin payload passes through for leads (unidade_id/responsavel_id trusted from client)', () => {
    const access = { nivel_acesso: 'admin' };
    const payload = applyCreateScope('leads', { unidade_id: 'outra-unidade', responsavel_id: 'outro-colab' }, access, collaborator);
    expect(payload).toEqual({ unidade_id: 'outra-unidade', responsavel_id: 'outro-colab' });
  });

  it('strips forged responsavel_id for non-leads entities regardless of level', () => {
    const access = { nivel_acesso: 'admin' };
    for (const entity of ['clientes', 'atendimentos', 'historico_atendimentos', 'veiculos_interesse']) {
      const payload = applyCreateScope(entity, { unidade_id: 'forjado', responsavel_id: 'forjado' }, access, collaborator);
      expect(payload).not.toHaveProperty('responsavel_id');
    }
  });

  it('strips forged unidade_id for entities other than leads/clientes regardless of level', () => {
    const access = { nivel_acesso: 'admin' };
    for (const entity of ['atendimentos', 'historico_atendimentos', 'veiculos_interesse']) {
      const payload = applyCreateScope(entity, { unidade_id: 'forjado' }, access, collaborator);
      expect(payload).not.toHaveProperty('unidade_id');
    }
  });

  it('keeps unidade_id for clientes (fonte unica de empresa, derivada no banco)', () => {
    const access = { nivel_acesso: 'admin' };
    const payload = applyCreateScope('clientes', { unidade_id: 'outra-unidade' }, access, collaborator);
    expect(payload).toEqual({ unidade_id: 'outra-unidade' });
  });

  it('always strips criado_por from client payload', () => {
    const access = { nivel_acesso: 'admin' };
    const payload = applyCreateScope('leads', { criado_por: 'forjado' }, access, collaborator);
    expect(payload).not.toHaveProperty('criado_por');
  });

  it('gestor create de lead forca unidade_id do colaborador', () => {
    const access = { nivel_acesso: 'gestor' };
    const payload = applyCreateScope('leads', { unidade_id: 'outra-unidade' }, access, collaborator);
    expect(payload.unidade_id).toBe('unidade-1');
  });

  it('usuario create de lead forca unidade_id e responsavel_id do colaborador', () => {
    const access = { nivel_acesso: 'usuario' };
    const payload = applyCreateScope('leads', { responsavel_id: 'outro-colab' }, access, collaborator);
    expect(payload.unidade_id).toBe('unidade-1');
    expect(payload.responsavel_id).toBe('colab-1');
  });

  it('usuario sem unidade_id nao consegue criar lead', () => {
    const access = { nivel_acesso: 'usuario' };
    expect(() => applyCreateScope('leads', {}, access, { id: 'colab-1' }))
      .toThrowError(expect.objectContaining({ message: 'Usuario sem unidade vinculada.', status: 403 }));
  });
});

describe('ensureCanManage', () => {
  it('throws a 403 when access is null', () => {
    expect(() => ensureCanManage(null)).toThrowError(expect.objectContaining({ status: 403 }));
  });

  it('throws a 403 for a level outside admin/gestor/usuario', () => {
    expect(() => ensureCanManage({ nivel_acesso: 'desconhecido' })).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
  });

  it('allows admin, gestor and usuario', () => {
    for (const nivel_acesso of ['admin', 'gestor', 'usuario']) {
      expect(() => ensureCanManage({ nivel_acesso })).not.toThrow();
    }
  });
});

describe('ensureCanConfigure', () => {
  it('throws a 403 for usuario (only admin/gestor can configure)', () => {
    expect(() => ensureCanConfigure({ nivel_acesso: 'usuario' })).toThrowError(
      expect.objectContaining({ status: 403 }),
    );
  });

  it('allows admin and gestor', () => {
    for (const nivel_acesso of ['admin', 'gestor']) {
      expect(() => ensureCanConfigure({ nivel_acesso })).not.toThrow();
    }
  });
});
