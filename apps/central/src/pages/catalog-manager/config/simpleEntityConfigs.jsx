function buildWhatsAppHref(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;

  const whatsappNumber = digits.startsWith('55') && [12, 13].includes(digits.length)
    ? digits
    : `55${digits}`;

  return `https://wa.me/${whatsappNumber}`;
}

function formatCnpj(cnpj) {
  if (!cnpj) return '-';
  const digits = String(cnpj).replace(/\D/g, '');

  if (digits.length !== 14) return cnpj;

  return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

export function buildDepartmentsConfig({
  assetsByDepartmentId,
  collaboratorsByDepartmentId,
  departments,
  formatDateTime,
}) {
  return {
    rows: departments,
    fields: [
      { key: 'nome', label: 'Nome', required: true, placeholder: 'Ex.: Tecnologia da Informacao' },
      { key: 'descricao', label: 'Descricao', fullWidth: true, placeholder: 'Ex.: Responsavel pela infraestrutura e sistemas internos' },
    ],
    columns: [
      { key: 'nome', label: 'Nome' },
      { key: 'descricao', label: 'Descricao' },
      { key: 'atualizado_em', label: 'Atualizado em', render: (value) => formatDateTime(value) },
    ],
    cardStats: {
      collaboratorsByDepartmentId,
      assetsByDepartmentId,
    },
    searchPlaceholder: 'Buscar por nome ou descricao...',
    queryKey: 'departamentos',
  };
}

export function buildPositionsConfig({
  Badge,
  collaborators,
  departments,
  departmentOptions,
  onViewCollaborators,
  positions,
}) {
  const collaboratorsByPositionId = collaborators.reduce((acc, collaborator) => {
    if (!collaborator.cargo_id) return acc;
    if (!acc[collaborator.cargo_id]) acc[collaborator.cargo_id] = [];
    acc[collaborator.cargo_id].push(collaborator);
    return acc;
  }, {});

  return {
    rows: positions,
    fields: [
      { key: 'nome', label: 'Nome do cargo', required: true, fullWidth: true, placeholder: 'Ex.: Vendedor' },
      {
        key: 'departamento_id',
        label: 'Departamento',
        type: 'select',
        allowEmpty: true,
        emptyLabel: 'Sem departamento',
        fullWidth: true,
        options: departmentOptions,
      },
    ],
    columns: [
      { key: 'nome', label: 'Cargo', render: (value) => <span className="font-medium text-foreground">{value || '-'}</span> },
      {
        key: 'departamento_id',
        label: 'Departamento',
        render: (value) => departments.find((department) => department.id === value)?.nome || 'Sem departamento',
      },
      {
        key: 'colaboradores_vinculados',
        label: 'Colaboradores',
        render: (_, row) => {
          const linkedCollaborators = collaboratorsByPositionId[row.id] || [];
          if (!linkedCollaborators.length) {
            return <span className="text-sm text-muted-foreground">Nenhum</span>;
          }

          return (
            <button
              type="button"
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onViewCollaborators?.(row)}
            >
              <Badge variant="secondary" className="rounded-full px-2.5 py-1 text-[11px] transition-colors hover:bg-primary hover:text-primary-foreground">
                {linkedCollaborators.length} {linkedCollaborators.length === 1 ? 'colaborador' : 'colaboradores'}
              </Badge>
            </button>
          );
        },
      },
    ],
    searchPlaceholder: 'Buscar por cargo ou departamento...',
    queryKey: 'cargos',
  };
}

export function buildCompaniesConfig({
  collaboratorsByCompanyId,
  companies,
  formatDateTime,
  unitsByCompanyId,
}) {
  return {
    rows: companies,
    fields: [
      { key: 'nome', label: 'Nome da Empresa', required: true, fullWidth: true, placeholder: 'Ex.: Macom Motos' },
    ],
    columns: [
      { key: 'nome', label: 'Nome', render: (value) => <span className="font-medium text-foreground">{value || '-'}</span> },
      {
        key: 'unidades_vinculadas',
        label: 'Unidades',
        render: (_, row) => unitsByCompanyId[row.id] || 0,
      },
      {
        key: 'colaboradores_vinculados',
        label: 'Colaboradores',
        render: (_, row) => collaboratorsByCompanyId[row.id] || 0,
      },
      { key: 'atualizado_em', label: 'Atualizado em', render: (value) => formatDateTime(value) },
    ],
    cardStats: {
      collaboratorsByCompanyId,
      unitsByCompanyId,
    },
    searchPlaceholder: 'Buscar por nome...',
    queryKey: 'empresas',
  };
}

export function buildUnitsConfig({
  assetsByUnitId,
  collaboratorsByUnitId,
  companies,
  companyOptions,
  formatDateTime,
  formatPhone,
  statusTone,
  unitStatusOptions,
  units,
  Badge,
}) {
  return {
    rows: units,
    fields: [
      { key: 'nome', label: 'Nome da Unidade', required: true, fullWidth: true, placeholder: 'ex: Macom Belem', inputClassName: 'h-10 rounded-lg border-input bg-background px-3 text-[15px] text-foreground focus-visible:ring-primary/20' },
      {
        key: 'empresa_id',
        label: 'Empresa',
        type: 'select',
        allowEmpty: true,
        emptyLabel: 'Sem empresa',
        fullWidth: true,
        inputClassName: 'h-10 rounded-lg border-input bg-background px-3 text-[15px] text-foreground',
        options: companyOptions,
      },
      {
        key: 'cnpj',
        label: 'CNPJ',
        halfWidth: true,
        placeholder: 'Ex.: 12345678000190',
        inputClassName: 'h-10 rounded-lg border-input bg-background px-3 text-[15px] text-foreground',
        inputMode: 'numeric',
        digitsOnly: true,
        maxLength: 14,
        validate: (value) =>
          value && String(value || '').replace(/\D/g, '').length !== 14
            ? 'CNPJ deve conter exatamente 14 digitos.'
            : '',
      },
      { key: 'cidade', label: 'Cidade', required: true, fullWidth: true, placeholder: 'ex: Belem', inputClassName: 'h-10 rounded-lg border-input bg-background px-3 text-[15px] text-foreground' },
      { key: 'endereco', label: 'Endereco', fullWidth: true, placeholder: 'Rua, numero, bairro', inputClassName: 'h-10 rounded-lg border-input bg-background px-3 text-[15px] text-foreground' },
      { key: 'telefone', label: 'Telefone', halfWidth: true, placeholder: '(91) 3000-0000', inputClassName: 'h-10 rounded-lg border-input bg-background px-3 text-[15px] text-foreground' },
      {
        key: 'ativo',
        label: 'Status',
        type: 'select',
        valueType: 'boolean',
        halfWidth: true,
        inputClassName: 'h-10 rounded-lg border-input bg-background px-3 text-[15px] text-foreground',
        options: unitStatusOptions,
      },
      { key: 'responsavel', label: 'Responsavel pela Unidade', fullWidth: true, placeholder: 'Nome do gerente/responsavel', inputClassName: 'h-10 rounded-lg border-input bg-background px-3 text-[15px] text-foreground' },
    ],
    columns: [
      { key: 'nome', label: 'Nome' },
      {
        key: 'empresa_id',
        label: 'Empresa',
        render: (value) => companies.find((item) => item.id === value)?.nome || '-',
      },
      { key: 'cnpj', label: 'CNPJ', render: (value) => formatCnpj(value) },
      { key: 'cidade', label: 'Cidade' },
      { key: 'endereco', label: 'Endereco' },
      { key: 'telefone', label: 'Telefone', render: (value) => formatPhone(value) },
      { key: 'responsavel', label: 'Responsavel' },
      {
        key: 'ativo',
        label: 'Status',
        render: (value) => (
          <Badge variant="outline" className={value ? statusTone.ativo : statusTone.inativo}>
            {value ? 'Ativa' : 'Inativa'}
          </Badge>
        ),
      },
      { key: 'atualizado_em', label: 'Atualizado em', render: (value) => formatDateTime(value) },
    ],
    cardStats: {
      assetsByUnitId,
      collaboratorsByUnitId,
    },
    searchPlaceholder: 'Buscar por nome, cidade, endereco, telefone ou responsavel...',
    queryKey: 'unidades',
  };
}

export function buildContactsConfig({
  contacts,
  contactTypeOptions,
  contactTypeTone,
  formatPhone,
  unitOptions,
  units,
  Badge,
}) {
  return {
    rows: contacts,
    fields: [
      {
        key: 'tipo',
        label: 'Tipo',
        type: 'select',
        required: true,
        defaultValue: 'fornecedor',
        fullWidth: true,
        inputClassName: 'h-9 rounded-md border-input px-3 text-sm shadow-sm',
        placeholder: 'Selecione o tipo',
        options: contactTypeOptions,
      },
      {
        key: 'nome',
        label: 'Nome do Fornecedor',
        required: true,
        fullWidth: true,
        inputClassName: 'h-9 rounded-md border-input px-3 text-sm shadow-sm',
        placeholder: 'Ex.: Joao Silva',
      },
      {
        key: 'identificador',
        label: 'CNPJ / Identificador',
        fullWidth: true,
        inputClassName: 'h-9 rounded-md border-input px-3 text-sm shadow-sm',
        placeholder: 'Ex.: 12.345.678/0001-90',
      },
      {
        key: 'descricao',
        label: 'Descricao / Servico prestado',
        type: 'textarea',
        fullWidth: true,
        inputClassName: 'min-h-[60px] rounded-md border-input px-3 py-2 text-sm shadow-sm',
        placeholder: 'Informacoes adicionais...',
      },
      {
        key: 'nome_contato',
        label: 'Nome do Contato',
        fullWidth: true,
        inputClassName: 'h-9 rounded-md border-input px-3 text-sm shadow-sm',
        placeholder: 'Ex.: Joao Silva',
      },
      {
        key: 'telefone',
        label: 'Telefone',
        halfWidth: true,
        inputClassName: 'h-9 rounded-md border-input px-3 text-sm shadow-sm',
        placeholder: 'Ex.: 85999999999',
        inputMode: 'numeric',
        digitsOnly: true,
        maxLength: 11,
        validate: (value) =>
          value && ![10, 11].includes(String(value || '').replace(/\D/g, '').length)
            ? 'Telefone do contato deve conter 10 ou 11 digitos.'
            : '',
      },
      {
        key: 'email',
        label: 'E-mail',
        halfWidth: true,
        inputClassName: 'h-9 rounded-md border-input px-3 text-sm shadow-sm',
        placeholder: 'Ex.: contato@empresa.com.br',
      },
      {
        key: 'unidade_id',
        label: 'Unidade / Filial',
        type: 'select',
        allowEmpty: true,
        emptyLabel: 'Sem unidade',
        fullWidth: true,
        inputClassName: 'h-9 rounded-md border-input px-3 text-sm shadow-sm',
        options: unitOptions,
      },
    ],
    columns: [
      {
        key: 'nome',
        label: 'Fornecedor',
        render: (value, row) => (
          <div>
            <p className="font-medium text-foreground">{value || '-'}</p>
            <p className="text-xs text-muted-foreground">{row.nome_contato || row.email || '-'}</p>
          </div>
        ),
      },
      {
        key: 'tipo',
        label: 'Tipo',
        render: (value) => (
          <Badge variant="outline" className={contactTypeTone[value] || contactTypeTone.outro}>
            {value || '-'}
          </Badge>
        ),
      },
      { key: 'identificador', label: 'CNPJ / Identificador', render: (value) => value || '-' },
      {
        key: 'telefone',
        label: 'Telefone',
        render: (value) => {
          const href = buildWhatsAppHref(value);
          const label = formatPhone(value);

          if (!href) return label;

          return (
            <a
              className="underline-offset-4 hover:underline"
              href={href}
              rel="noopener noreferrer"
              target="_blank"
            >
              {label}
            </a>
          );
        },
      },
      { key: 'email', label: 'Email', render: (value) => value || '-' },
      {
        key: 'unidade_id',
        label: 'Unidade',
        render: (value) => units.find((item) => item.id === value)?.nome || '-',
      },
    ],
    searchPlaceholder: 'Buscar por fornecedor, contato, telefone ou email...',
    queryKey: 'contatos',
  };
}

export function buildInfrastructureConfig({
  formatDateTime,
  infrastructureTypeOptions,
  infraRows,
  unitOptions,
  units,
  Badge,
  Globe,
  Network,
}) {
  return {
    rows: infraRows,
    fields: [
      {
        key: 'tipo',
        label: 'Tipo',
        type: 'select',
        required: true,
        defaultValue: 'ip',
        inputClassName: 'h-9 rounded-md border-input px-3 text-sm shadow-sm',
        placeholder: 'Selecione o tipo',
        options: infrastructureTypeOptions,
      },
      {
        key: 'nome',
        label: 'Titulo / Nome',
        required: true,
        inputClassName: 'h-9 rounded-md border-input px-3 text-sm shadow-sm',
        placeholder: 'ex: Servidor Principal, Fornecedor Dell...',
      },
      {
        key: 'valor_identificador',
        label: (formState) => (formState?.tipo === 'link' ? 'URL do Sistema' : 'Endereco IP'),
        required: true,
        inputClassName: 'h-9 rounded-md border-input px-3 text-sm shadow-sm',
        placeholder: (formState) =>
          formState?.tipo === 'link' ? 'https://sistema.empresa.com.br' : 'Valor',
        validate: (value, formState) => {
          const rawValue = String(value || '').trim();
          const tipo = String(formState?.tipo || 'ip').trim().toLowerCase();

          if (!rawValue) return '';

          if (tipo === 'ip') {
            const octets = rawValue.split('.');
            const validIp =
              octets.length === 4 &&
              octets.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
            return validIp ? '' : 'Informe um endereco IP valido.';
          }

          try {
            const url = new URL(rawValue);
            return ['http:', 'https:'].includes(url.protocol)
              ? ''
              : 'A URL deve iniciar com http:// ou https://.';
          } catch {
            return 'Informe uma URL valida do sistema.';
          }
        },
      },
      {
        key: 'descricao',
        label: 'Descricao / Observacao',
        type: 'textarea',
        inputClassName: 'min-h-[60px] rounded-md border-input px-3 py-2 text-sm shadow-sm',
        placeholder: 'Informacoes adicionais...',
      },
      {
        key: 'unidade_id',
        label: 'Unidade / Filial',
        type: 'select',
        required: true,
        inputClassName: 'h-9 rounded-md border-input px-3 text-sm shadow-sm',
        placeholder: 'Selecione a unidade',
        options: unitOptions,
      },
    ],
    columns: [
      {
        key: 'tipo',
        label: 'Tipo',
        render: (value) => (
          <Badge variant="outline" className={value === 'link' ? 'border-blue-200 bg-blue-100 text-blue-800' : 'border-emerald-200 bg-emerald-100 text-emerald-800'}>
            {value === 'link' ? 'LINK' : 'IP'}
          </Badge>
        ),
      },
      { key: 'nome', label: 'Nome', render: (value) => <span className="font-medium text-foreground">{value || '-'}</span> },
      {
        key: 'valor_identificador',
        label: 'Identificador',
        render: (value, row) => (
          <div className="flex items-center gap-2">
            {row.tipo === 'link' ? <Globe className="h-4 w-4 text-muted-foreground" /> : <Network className="h-4 w-4 text-muted-foreground" />}
            <span className="break-all">{value || '-'}</span>
          </div>
        ),
      },
      {
        key: 'unidade_id',
        label: 'Unidade',
        render: (value) => units.find((item) => item.id === value)?.nome || '-',
      },
      { key: 'descricao', label: 'Descricao', render: (value) => value || '-' },
      { key: 'atualizado_em', label: 'Atualizado em', render: (value) => formatDateTime(value) },
    ],
    searchPlaceholder: 'Buscar por nome, IP, URL, descricao ou unidade...',
    queryKey: 'infra_estrutura',
  };
}

export function buildCorporateLinesConfig({
  collaborators,
  corporateLineStatusOptions,
  corporateLineTypeOptions,
  corporateLines,
  hasExactDigits,
  statusTone,
  unitOptions,
  units,
  collaboratorOptions,
  Badge,
}) {
  return {
    rows: corporateLines,
    fields: [
      {
        key: 'tipo',
        label: 'Tipo',
        type: 'select',
        required: true,
        defaultValue: 'chip',
        options: corporateLineTypeOptions,
      },
      {
        key: 'nome',
        label: 'Nome / Identificacao',
        placeholder: 'Ex.: Linha Comercial 01',
      },
      {
        key: 'numero',
        label: 'Numero',
        required: true,
        placeholder: 'Ex.: 85999999999',
        inputMode: 'numeric',
        digitsOnly: true,
        maxLength: 11,
        validate: (value) =>
          value && !hasExactDigits(value, 11) ? 'Numero deve conter exatamente 11 digitos.' : '',
      },
      {
        key: 'operadora',
        label: 'Operadora',
        placeholder: 'Ex.: Vivo',
      },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        defaultValue: 'disponivel',
        options: corporateLineStatusOptions,
      },
      {
        key: 'colaborador_id',
        label: 'Colaborador Vinculado',
        type: 'select',
        allowEmpty: true,
        emptyLabel: 'Sem colaborador',
        options: collaboratorOptions,
      },
      {
        key: 'unidade_id',
        label: 'Unidade / Filial',
        type: 'select',
        allowEmpty: true,
        emptyLabel: 'Sem unidade',
        options: unitOptions,
      },
      {
        key: 'observacao',
        label: 'Observacao',
        type: 'textarea',
        fullWidth: true,
        placeholder: 'Informacoes adicionais sobre a linha',
      },
    ],
    columns: [
      {
        key: 'nome',
        label: 'Linha',
        render: (value, row) => (
          <div>
            <p className="font-medium text-foreground">{value || '-'}</p>
            <p className="text-xs text-muted-foreground">{row.numero || '-'}</p>
          </div>
        ),
      },
      {
        key: 'tipo',
        label: 'Tipo',
        render: (value) => (
          <Badge variant="outline" className="border-slate-200 bg-slate-100 text-slate-800">
            {value === 'linha_movel' ? 'Linha Movel' : value === 'telefone_fixo' ? 'Telefone Fixo' : value || '-'}
          </Badge>
        ),
      },
      { key: 'operadora', label: 'Operadora', render: (value) => value || '-' },
      {
        key: 'status',
        label: 'Status',
        render: (value) => (
          <Badge variant="outline" className={statusTone[value] || statusTone.inativo}>
            {value === 'em_uso' ? 'Em Uso' : value || '-'}
          </Badge>
        ),
      },
      {
        key: 'colaborador_id',
        label: 'Colaborador',
        render: (value) => collaborators.find((item) => item.id === value)?.nome || '-',
      },
      {
        key: 'unidade_id',
        label: 'Unidade',
        render: (value) => units.find((item) => item.id === value)?.nome || '-',
      },
    ],
    searchPlaceholder: 'Buscar por nome, numero, operadora ou colaborador...',
    queryKey: 'linhas_corporativas',
  };
}

export function buildAssetsConfig({
  assetCategoryOptions,
  assetConditionOptions,
  assetStatusOptions,
  assetStatusLabels,
  assets,
  collaborators,
  collaboratorOptions,
  statusTone,
  unitOptions,
  units,
  Badge,
}) {
  return {
    rows: assets,
    fields: [
      { key: 'nome', label: 'Nome', required: true, placeholder: 'Ex.: Notebook Dell Latitude 5440', inputClassName: 'h-9 rounded-lg px-3 text-[14px]' },
      {
        key: 'categoria',
        label: 'Categoria',
        type: 'select',
        required: true,
        inputClassName: 'h-9 rounded-lg px-3 text-[14px]',
        options: assetCategoryOptions,
      },
      { key: 'marca', label: 'Marca', placeholder: 'Ex.: Dell', inputClassName: 'h-9 rounded-lg px-3 text-[14px]' },
      { key: 'modelo', label: 'Modelo', placeholder: 'Ex.: Latitude 5440', inputClassName: 'h-9 rounded-lg px-3 text-[14px]' },
      { key: 'numero_serie', label: 'Numero de serie', required: true, placeholder: 'Ex.: SN123456789', inputClassName: 'h-9 rounded-lg px-3 text-[14px]' },
      { key: 'patrimonio', label: 'Patrimonio', disabled: true, placeholder: 'Gerado automaticamente', inputClassName: 'h-9 rounded-lg px-3 text-[14px]' },
      {
        key: 'unidade_id',
        label: 'Unidade',
        type: 'select',
        required: true,
        inputClassName: 'h-9 rounded-lg px-3 text-[14px]',
        options: unitOptions,
      },
      { key: 'localizacao_interna', label: 'Localizacao interna', placeholder: 'Ex.: Sala TI / Rack 02 / Mesa 14', inputClassName: 'h-9 rounded-lg px-3 text-[14px]' },
      { key: 'observacao', label: 'Observacao', fullWidth: true, placeholder: 'Ex.: Equipamento reserva para equipe comercial', inputClassName: 'h-9 rounded-lg px-3 text-[14px]' },
      {
        key: 'estado',
        label: 'Estado',
        type: 'select',
        inputClassName: 'h-9 rounded-lg px-3 text-[14px]',
        options: assetConditionOptions,
      },
      {
        key: 'usuario_id',
        label: 'Usuario vinculado',
        type: 'select',
        allowEmpty: true,
        emptyLabel: 'Sem usuario',
        placeholder: 'Selecione um usuario',
        inputClassName: 'h-9 rounded-lg px-3 text-[14px]',
        options: collaboratorOptions,
      },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        inputClassName: 'h-9 rounded-lg px-3 text-[14px]',
        options: assetStatusOptions,
      },
    ],
    columns: [
      { key: 'patrimonio', label: 'Codigo', render: (value, row) => value || row.id?.slice(0, 8) || '-' },
      { key: 'nome', label: 'Equipamento', render: (value) => <span className="font-bold text-foreground">{value || '-'}</span> },
      { key: 'categoria', label: 'Categoria', render: (value) => value || '-' },
      { key: 'numero_serie', label: 'Nº Serie' },
      {
        key: 'status',
        label: 'Status',
        render: (value) => (
          <Badge variant="outline" className={statusTone[value] || statusTone.inativo}>
            {assetStatusLabels[value] || value || '-'}
          </Badge>
        ),
      },
      {
        key: 'unidade_id',
        label: 'Unidade',
        render: (value) => units.find((item) => item.id === value)?.nome || '—',
      },
      {
        key: 'usuario_id',
        label: 'Responsavel',
        render: (value) => collaborators.find((item) => item.id === value)?.nome || '—',
      },
    ],
    searchPlaceholder: 'Buscar por nome, codigo, serie ou responsavel...',
    queryKey: 'ativos',
  };
}

export function buildCollaboratorsConfig({
  assetsByProfileId,
  Badge,
  collaboratorRoleOptions,
  collaboratorStatusOptions,
  collaborators,
  companies,
  companyOptions,
  departments,
  departmentOptions,
  editingRecord,
  formatPhone,
  hasExactDigits,
  linesByProfileId,
  Monitor,
  onViewLinks,
  positions,
  systemsByProfileId,
  statusTone,
  unitOptions,
  units,
}) {
  const roleLabels = {
    admin: 'Admin',
    gestor: 'Gestor',
    usuario: 'Usuario',
  };
  const roleTone = {
    admin: 'bg-blue-100 text-blue-700',
    gestor: 'bg-amber-100 text-amber-700',
    usuario: 'bg-slate-100 text-slate-700',
  };
  const buildPositionOptions = (formState = {}, record = {}) => {
    const safeRecord = record || {};
    const selectedDepartmentId = formState.departamento_id || safeRecord.departamento_id || '';
    const selectedPositionId = formState.cargo_id || safeRecord.cargo_id || '';
    const filteredPositions = positions.filter((position) => (
      !selectedDepartmentId ||
      !position.departamento_id ||
      position.departamento_id === selectedDepartmentId ||
      position.id === selectedPositionId
    ));
    const positionsById = new Map(filteredPositions.map((position) => [position.id, position]));

    if (selectedPositionId && !positionsById.has(selectedPositionId)) {
      const selectedPosition = positions.find((position) => position.id === selectedPositionId);
      if (selectedPosition) {
        positionsById.set(selectedPosition.id, selectedPosition);
      }
    }

    return [...positionsById.values()].map((position) => ({
      value: position.id,
      label: position.nome,
    }));
  };

  return {
    rows: collaborators,
    fields: [
      { key: 'nome', label: 'Nome', required: true, placeholder: 'Ex.: Kevin Kley Soares' },
      { key: 'email', label: 'Email', required: true, disabled: Boolean(editingRecord?.id), placeholder: 'Ex.: kevinkleymacom@gmail.com' },
      {
        key: 'funcao',
        label: 'Funcao',
        type: 'select',
        defaultValue: 'usuario',
        disabled: Boolean(editingRecord?.id),
        options: collaboratorRoleOptions,
      },
      {
        key: 'cpf',
        label: 'CPF',
        placeholder: 'Ex.: 12345678901',
        inputMode: 'numeric',
        digitsOnly: true,
        maxLength: 11,
        validate: (value) =>
          value && !hasExactDigits(value, 11) ? 'CPF deve conter exatamente 11 digitos.' : '',
      },
      {
        key: 'telefone',
        label: 'Telefone',
        halfWidth: true,
        inputClassName: 'h-9 rounded-md border-input px-3 text-sm shadow-sm',
        placeholder: 'Ex.: 85999999999',
        inputMode: 'numeric',
        digitsOnly: true,
        maxLength: 11,
        validate: (value) =>
          value && !hasExactDigits(value, 11) ? 'Telefone deve conter exatamente 11 digitos.' : '',
      },
      {
        key: 'empresa_id',
        label: 'Empresa',
        type: 'select',
        allowEmpty: true,
        emptyLabel: 'Sem empresa',
        options: companyOptions,
      },
      {
        key: 'departamento_id',
        label: 'Departamento',
        type: 'select',
        allowEmpty: true,
        emptyLabel: 'Sem departamento',
        options: departmentOptions,
      },
      {
        key: 'cargo_id',
        label: 'Cargo',
        type: 'select',
        allowEmpty: true,
        emptyLabel: 'Sem cargo',
        placeholder: 'Selecione um cargo',
        options: buildPositionOptions,
      },
      { key: 'data_nascimento', label: 'Data de nascimento', type: 'date' },
      { key: 'data_admissao', label: 'Data de admissao', type: 'date' },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        defaultValue: 'ativo',
        disabled: Boolean(editingRecord?.id),
        options: collaboratorStatusOptions,
      },
      {
        key: 'unidade_id',
        label: 'Unidade',
        type: 'select',
        allowEmpty: true,
        emptyLabel: 'Sem unidade',
        options: unitOptions,
      },
    ],
    columns: [
      {
        key: 'nome',
        label: 'Nome',
        render: (value, row) => (
          <div>
            <p className="text-[14px] font-semibold leading-5 text-foreground">{value || '-'}</p>
            <p className="text-[12px] leading-4 text-muted-foreground">{row.email || '-'}</p>
          </div>
        ),
      },
      { key: 'telefone', label: 'Telefone', render: (value) => <span className="text-[14px]">{formatPhone(value)}</span> },
      {
        key: 'equipamentos_vinculados',
        label: 'Equipamentos',
        render: (_, row) => {
          const total =
            (assetsByProfileId[row.id] || 0) +
            (linesByProfileId[row.id] || 0) +
            (systemsByProfileId[row.id] || 0);

          if (total > 0) {
            return (
              <button
                type="button"
                className="mx-auto flex items-center justify-center gap-1.5 text-[14px] transition-colors hover:text-foreground"
                onClick={() => onViewLinks(row)}
                title="Clique para ver os itens vinculados"
                aria-label={`Ver ${total} item(ns) vinculado(s)`}
              >
                <Monitor className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold">{total}</span>
              </button>
            );
          }

          return (
            <div className="mx-auto flex items-center justify-center gap-1.5 text-[14px]">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold">0</span>
            </div>
          );
        },
      },
      {
        key: 'empresa_id',
        label: 'Empresa',
        render: (value) => companies.find((item) => item.id === value)?.nome || '—',
      },
      {
        key: 'departamento_id',
        label: 'Departamento',
        render: (value) => {
          const label = departments.find((item) => item.id === value)?.nome || '—';
          return <span className="rounded-md border border-border px-3 py-1 text-[13px] leading-none">{label}</span>;
        },
      },
      {
        key: 'cargo_id',
        label: 'Cargo',
        render: (value, row) => positions.find((item) => item.id === value)?.nome || row.cargo || '—',
      },
      {
        key: 'funcao',
        label: 'Acesso',
        render: (value) => (
          <span
            className={`rounded-md px-3 py-1 text-[13px] font-semibold leading-none ${
              roleTone[value] || roleTone.usuario
            }`}
          >
            {roleLabels[value] || value || 'Usuario'}
          </span>
        ),
      },
      {
        key: 'unidade_id',
        label: 'Unidade',
        render: (value) => units.find((item) => item.id === value)?.nome || '—',
      },
      {
        key: 'status',
        label: 'Status',
        render: (value) => (
          <Badge variant="outline" className={`text-[13px] ${statusTone[value] || statusTone.inativo}`}>
            {value || '-'}
          </Badge>
        ),
      },
    ],
    searchPlaceholder: 'Buscar por nome, email ou CPF...',
    queryKey: 'colaboradores',
  };
}

export function buildTermsConfig({
  assetOptions,
  Badge,
  collaboratorOptions,
  editingRecord,
  formatDateTime,
  statusTone,
  termStatusOptions,
  terms,
}) {
  return {
    rows: terms,
    fields: [
      ...(editingRecord?.id
        ? []
        : [
            {
              key: 'ativo_id',
              label: 'Ativo',
              type: 'select',
              required: true,
              options: assetOptions,
              placeholder: 'Selecione o equipamento',
            },
            {
              key: 'colaborador_id',
              label: 'Colaborador',
              type: 'select',
              required: true,
              options: collaboratorOptions,
              placeholder: 'Selecione o colaborador',
            },
          ]),
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        defaultValue: 'gerado',
        options: termStatusOptions,
      },
      {
        key: 'observacoes',
        label: 'Observacoes',
        type: 'textarea',
        fullWidth: true,
        placeholder: 'Informacoes adicionais do termo',
      },
      {
        key: 'conteudo',
        label: 'Conteudo do termo',
        type: 'textarea',
        fullWidth: true,
        placeholder: 'Se vazio, o sistema gera um texto base automaticamente.',
      },
      {
        key: 'assinado_em',
        label: 'Data de assinatura',
        type: 'date',
      },
      {
        key: 'devolvido_em',
        label: 'Data de devolucao',
        type: 'date',
      },
    ],
    columns: [
      { key: 'codigo', label: 'Codigo', render: (value) => <span className="font-semibold">{value || '-'}</span> },
      {
        key: 'ativo_nome',
        label: 'Equipamento',
        render: (value, row) => (
          <div>
            <p className="font-medium text-foreground">{value || '-'}</p>
            <p className="text-xs text-muted-foreground">{row.ativo_patrimonio || row.ativo_numero_serie || '-'}</p>
          </div>
        ),
      },
      {
        key: 'colaborador_nome',
        label: 'Colaborador',
        render: (value, row) => (
          <div>
            <p className="font-medium text-foreground">{value || '-'}</p>
            <p className="text-xs text-muted-foreground">{row.colaborador_email || '-'}</p>
          </div>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        render: (value) => (
          <Badge variant="outline" className={statusTone[value] || statusTone.inativo}>
            {value || '-'}
          </Badge>
        ),
      },
      { key: 'gerado_em', label: 'Gerado em', render: (value) => formatDateTime(value) },
      { key: 'assinado_em', label: 'Assinado em', render: (value) => formatDateTime(value) },
      {
        key: 'arquivo_nome',
        label: 'Comprovante assinado',
        render: (value) => value || '-',
      },
    ],
    searchPlaceholder: 'Buscar por codigo, equipamento, colaborador ou patrimonio...',
    queryKey: 'termos_posse',
  };
}
