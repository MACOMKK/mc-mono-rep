import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';

import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import { Spinner } from './spinner';

const INITIAL_FORM = {
  password: '',
  confirmPassword: '',
};

export function PasswordChangeForm({
  required = false,
  onCancel,
  onSubmit,
  onSuccess,
}) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const validate = () => {
    const password = form.password.trim();
    const confirmPassword = form.confirmPassword.trim();

    if (password.length < 8) {
      return 'A nova senha deve ter pelo menos 8 caracteres.';
    }

    if (password !== confirmPassword) {
      return 'As senhas informadas nao conferem.';
    }

    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationMessage = validate();

    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    try {
      setSubmitting(true);
      setMessage('');
      await onSubmit(form.password.trim());
      setForm(INITIAL_FORM);
      onSuccess?.();
    } catch (error) {
      setMessage(error?.message || 'Nao foi possivel atualizar a senha.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-lg">
      {message ? (
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-password" className="text-slate-900">Nova senha</Label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="new-password"
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              className="pl-10 pr-11 text-slate-900 placeholder:text-slate-400"
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 transition-colors hover:text-slate-700"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-new-password" className="text-slate-900">Confirmar nova senha</Label>
          <Input
            id="confirm-new-password"
            type={showPassword ? 'text' : 'password'}
            value={form.confirmPassword}
            onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
            className="text-slate-900 placeholder:text-slate-400"
            autoComplete="new-password"
            required
          />
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
        {!required && onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? <Spinner size="sm" /> : null}
          Salvar nova senha
        </Button>
      </div>
    </form>
  );
}

export default PasswordChangeForm;
