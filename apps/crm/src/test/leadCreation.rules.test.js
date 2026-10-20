import { beforeEach, describe, expect, it, vi } from 'vitest';

// Nivel 3 (item 7) da auditoria do CRM (2026-10-20): LeadRepository.create/mapLeadPayload nao
// tinham nenhuma cobertura de teste, apesar de concentrar toda validacao client-side da criacao
// de lead (nome/telefone/email, origem obrigatoria, motivo obrigatorio por etapa) antes de bater
// na crm-api. Mesmo padrao de mock de proposta-venda.rules.test.js: crmApi.leads.saveFull e
// mockado para capturar o payload calculado sem bater na rede/Supabase.
vi.mock('@macom/api-client/crmApi', () => ({
  crmApi: {
    leads: {
      saveFull: vi.fn(async ({ clientePayload, leadPayload, vehiclePayload }) => ({
        lead: { id: 'lead-1', ...clientePayload, ...leadPayload },
        vehicle: vehiclePayload ? { id: 'veiculo-interesse-1', ...vehiclePayload } : null,
      })),
      list: vi.fn(async () => []),
      listPage: vi.fn(async () => ({ rows: [], count: 0 })),
    },
  },
}));

vi.mock('@macom/api-client/supabaseClient', () => ({
  supabase: undefined,
  assertSupabaseConfigured: vi.fn(),
}));

const { crmApi } = await import('@macom/api-client/crmApi');
const { crmDataClient } = await import('@/api/crmDataClient');

beforeEach(() => {
  vi.clearAllMocks();
});

const baseData = {
  nome: 'Joao da Silva',
  telefone: '(91) 98888-7777',
  email: 'joao@example.com',
  origem_id: 'origem-1',
};

describe('LeadRepository.create (validacao sincrona)', () => {
  it('exige nome e sobrenome', async () => {
    await expect(crmDataClient.entities.Lead.create({ ...baseData, nome: 'Joao' }))
      .rejects.toThrow(/deve ter nome e sobrenome/);
    expect(crmApi.leads.saveFull).not.toHaveBeenCalled();
  });

  it('exige telefone com DDD + numero (10 ou 11 digitos)', async () => {
    await expect(crmDataClient.entities.Lead.create({ ...baseData, telefone: '123' }))
      .rejects.toThrow(/Telefone .* invalido/);
    expect(crmApi.leads.saveFull).not.toHaveBeenCalled();
  });

  it('rejeita e-mail em formato invalido', async () => {
    await expect(crmDataClient.entities.Lead.create({ ...baseData, email: 'nao-e-email' }))
      .rejects.toThrow(/E-mail .* invalido/);
    expect(crmApi.leads.saveFull).not.toHaveBeenCalled();
  });

  it('aceita lead sem e-mail (campo opcional)', async () => {
    await crmDataClient.entities.Lead.create({ ...baseData, email: '' });
    expect(crmApi.leads.saveFull).toHaveBeenCalled();
  });

  it('exige origem_id', async () => {
    await expect(crmDataClient.entities.Lead.create({ ...baseData, origem_id: undefined }))
      .rejects.toThrow(/Selecione a origem do lead/);
    expect(crmApi.leads.saveFull).not.toHaveBeenCalled();
  });

  it('exige motivo quando a etapa de destino exige', async () => {
    await expect(crmDataClient.entities.Lead.create({
      ...baseData,
      etapa: { id: 'etapa-1', nome: 'Qualificado', exige_motivo: true },
    })).rejects.toThrow(/Selecione um motivo para mover o lead para Qualificado/);
    expect(crmApi.leads.saveFull).not.toHaveBeenCalled();
  });

  it('aceita quando a etapa exige motivo e motivo_status_id foi informado', async () => {
    await crmDataClient.entities.Lead.create({
      ...baseData,
      etapa: { id: 'etapa-1', nome: 'Qualificado', exige_motivo: true },
      motivo_status_id: 'motivo-1',
    });
    expect(crmApi.leads.saveFull).toHaveBeenCalled();
  });
});

describe('LeadRepository.create (forma do payload enviado a crm-api)', () => {
  it('normaliza telefone/email e resolve empresa pela unidade', async () => {
    await crmDataClient.entities.Lead.create({ ...baseData, empresa: 'CRM Belém' });

    expect(crmApi.leads.saveFull).toHaveBeenCalledWith(expect.objectContaining({
      leadPayload: expect.objectContaining({
        nome: 'Joao da Silva',
        telefone_normalizado: '91988887777',
        email_normalizado: 'joao@example.com',
        origem_id: 'origem-1',
        empresa: 'Macom Belém',
      }),
    }));
  });

  it('nao inclui pipeline_id/etapa_id quando nao informados (leads.status nao existe mais)', async () => {
    await crmDataClient.entities.Lead.create(baseData);

    const [[payload]] = crmApi.leads.saveFull.mock.calls;
    expect(payload.leadPayload).not.toHaveProperty('pipeline_id');
    expect(payload.leadPayload).not.toHaveProperty('etapa_id');
  });

  it('inclui pipeline_id/etapa_id quando informados', async () => {
    await crmDataClient.entities.Lead.create({ ...baseData, pipeline_id: 'pipeline-1', etapa_id: 'etapa-1' });

    expect(crmApi.leads.saveFull).toHaveBeenCalledWith(expect.objectContaining({
      leadPayload: expect.objectContaining({ pipeline_id: 'pipeline-1', etapa_id: 'etapa-1' }),
    }));
  });

  it('so envia eh_teste quando marcado (omitido para nao sobrescrever em update)', async () => {
    await crmDataClient.entities.Lead.create(baseData);
    const [[semTeste]] = crmApi.leads.saveFull.mock.calls;
    expect(semTeste.leadPayload).not.toHaveProperty('eh_teste');

    await crmDataClient.entities.Lead.create({ ...baseData, eh_teste: true });
    const [, [comTeste]] = crmApi.leads.saveFull.mock.calls;
    expect(comTeste.leadPayload).toMatchObject({ eh_teste: true });
  });

  it('marca o cliente vinculado como status_relacionamento=cliente quando o lead ja nasce em etapa de ganho', async () => {
    await crmDataClient.entities.Lead.create({ ...baseData, etapa_tipo: 'ganho' });

    expect(crmApi.leads.saveFull).toHaveBeenCalledWith(expect.objectContaining({
      clientePayload: expect.objectContaining({ status_relacionamento: 'cliente' }),
    }));
  });

  it('retorna o lead mapeado a partir da resposta da crm-api', async () => {
    const lead = await crmDataClient.entities.Lead.create(baseData);
    expect(lead.id).toBe('lead-1');
    expect(lead.nome).toBe('Joao da Silva');
  });
});
