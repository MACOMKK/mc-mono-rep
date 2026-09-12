import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { appClient } from '@/api/client';
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@macom/ui';

function normalizeDateInput(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

export default function EmployeeForm({ onSubmit, isLoading, initial = {}, mode = 'edit' }) {
  const isEditMode = mode === 'edit';
  const [form, setForm] = useState({
    name: initial.name || '',
    email: initial.email || '',
    department: initial.department || '',
    position: initial.position || '',
    unit: initial.unit_id || '',
    birth_date: normalizeDateInput(initial.birth_date),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['catalog-departments'],
    queryFn: () => appClient.catalogs.listDepartments(),
  });

  const { data: units = [] } = useQuery({
    queryKey: ['catalog-units'],
    queryFn: () => appClient.catalogs.listUnits(),
  });

  const handleSubmit = (event) => {
    event.preventDefault();

    onSubmit({
      name: form.name,
      email: form.email,
      department: form.department,
      unit: form.unit,
      birth_date: form.birth_date,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Nome Completo</Label>
        <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required placeholder="Nome do colaborador" />
      </div>
      <div className="space-y-2">
        <Label>E-mail</Label>
        <Input
          type="email"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          placeholder="email@macom.com.br"
          disabled={isEditMode}
        />
      </div>
      <div className="space-y-2">
        <Label>Cargo</Label>
        <Input value={form.position || 'Sem cargo'} disabled />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Departamento</Label>
          <Select
            value={form.department || '__none__'}
            onValueChange={(value) => setForm({ ...form, department: value === '__none__' ? '' : value })}
            disabled={isEditMode}
          >
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sem departamento</SelectItem>
              {departments.map((department) => (
                <SelectItem key={department.id} value={department.key}>
                  {department.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Unidade</Label>
          <Select
            value={form.unit || '__none__'}
            onValueChange={(value) => setForm({ ...form, unit: value === '__none__' ? '' : value })}
            disabled={isEditMode}
          >
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sem unidade</SelectItem>
              {units.map((unit) => (
                <SelectItem key={unit.id} value={unit.id}>
                  {unit.city || unit.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Data de Nascimento</Label>
        <Input type="date" value={form.birth_date} onChange={(event) => setForm({ ...form, birth_date: event.target.value })} disabled={isEditMode} />
      </div>
      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? 'Salvando...' : 'Salvar Colaborador'}
      </Button>
    </form>
  );
}

