import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { financeiroApi } from '@macom/api-client/financeiroApi';
import { oficinaApi } from '@macom/api-client/oficinaApi';
import {
  assertSupabaseConfigured,
  checkLoginLock,
  getAuthErrorMessage,
  isSupabaseConfigured,
  reportFailedLogin,
  reportLoginSuccess,
  supabase,
} from '@macom/api-client/supabaseClient';

const AuthContext = createContext(null);

function normalizeServicosUser(authUser, authPayload = {}, oficinaRole = null) {
  const collaborator = authPayload.row || null;
  const access = authPayload.access || null;
  // Papel efetivo no modulo Financeiro (Camada 2, gestao_servicos.permissoes_modulo):
  // usuario = solicitante, aprovador = aprova/reprova, financeiro = tambem marca como pago.
  // Nao confundir com o nivel de acesso ao sistema inteiro (Camada 1).
  const role = authPayload.role || 'usuario';

  return {
    id: collaborator?.id || authUser?.id || null,
    auth_id: authUser?.id || null,
    email: collaborator?.email || authUser?.email || '',
    name:
      collaborator?.nome ||
      authUser?.user_metadata?.full_name ||
      authUser?.user_metadata?.name ||
      authUser?.email?.split('@')[0] ||
      'Usuario',
    photoUrl: collaborator?.foto_url || null,
    signatureUrl: collaborator?.assinatura_url || null,
    role,
    // 'nenhum' = sem acesso liberado ao modulo (usado pra esconder o modulo do menu/rotas, ver
    // apps/servicos/src/lib/navigation.js e App.jsx).
    hasFinanceiroAccess: role !== 'nenhum',
    isAprovador: role === 'aprovador' || role === 'financeiro',
    isFinanceiro: role === 'financeiro',
    isPagador: role === 'contas_a_pagar' || role === 'financeiro',
    // Reprovar uma solicitacao JA APROVADA (tela Pagamentos) -- financeiro sempre pode; contas a
    // pagar so quando a flag restringir_reprovacao_contas_a_pagar estiver desativada (backend
    // calcula em `me`, ver servicos-api/index.ts). Nao tem relacao com reprovar pendente
    // (Aprovacoes), que continua so isAprovador/isFinanceiro.
    canReprovarAprovada: Boolean(authPayload.pode_reprovar_aprovada),
    // Papel efetivo no modulo Oficina (Camada 2), resolvido via servicos-oficina-api
    // (edge function separada, ver apps/servicos/CLAUDE.md) -- nao vem de authPayload
    // porque financeiro/oficina sao papeis independentes em modulos diferentes.
    oficinaRole,
    hasOficinaAccess: Boolean(oficinaRole) && oficinaRole !== 'nenhum',
    isOficinaInspetor: oficinaRole === 'inspetor' || oficinaRole === 'gestor' || oficinaRole === 'admin',
    isOficinaGestor: oficinaRole === 'gestor' || oficinaRole === 'admin',
    active: collaborator?.status !== 'inativo' && access?.ativo === true,
    system_access_id: access?.id || null,
    system_access_level: access?.nivel_acesso || null,
    collaborator,
    access,
    must_change_password: Boolean(authPayload.mustChangePassword),
  };
}

function mapAuthError(error) {
  if (!isSupabaseConfigured) {
    return {
      type: 'config',
      message: 'Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env.local.',
    };
  }

  if (error?.status === 401) {
    return {
      type: 'auth_required',
      message: error.message || 'Faca login para acessar o sistema Servicos.',
    };
  }

  if (error?.status === 403) {
    return {
      type: 'access_denied',
      message: error.message || 'Seu usuario nao possui acesso liberado ao sistema Servicos.',
    };
  }

  return {
    type: 'unknown',
    message: error?.message || 'Nao foi possivel validar o acesso ao sistema Servicos.',
  };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const validatedTokenRef = useRef(null);
  const userRef = useRef(null);
  const inFlightValidationRef = useRef(null);

  function clearAuthState() {
    validatedTokenRef.current = null;
    userRef.current = null;
    setSession(null);
    setUser(null);
    setIsAuthenticated(false);
    setAuthError(null);
    setMustChangePassword(false);
    setIsLoadingAuth(false);
  }

  async function runAccessValidation(nextSession) {
    if (!isSupabaseConfigured) {
      setAuthError(mapAuthError());
      setIsLoadingAuth(false);
      return null;
    }

    if (!nextSession?.user || !nextSession?.access_token) {
      clearAuthState();
      return null;
    }

    try {
      const [authPayload, oficinaPayload] = await Promise.all([
        financeiroApi.auth.me(nextSession.access_token),
        oficinaApi.auth.me(nextSession.access_token).catch(() => ({ role: null })),
      ]);
      const currentUser = normalizeServicosUser(nextSession.user, authPayload, oficinaPayload.role);

      if (!currentUser.active) {
        const accessError = new Error('Seu usuario nao possui acesso ativo ao sistema Servicos.');
        accessError.status = 403;
        throw accessError;
      }

      validatedTokenRef.current = nextSession.access_token;
      userRef.current = currentUser;
      setSession(nextSession);
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
      setMustChangePassword(Boolean(currentUser.must_change_password));
      return currentUser;
    } catch (error) {
      validatedTokenRef.current = null;
      userRef.current = null;
      setSession(null);
      setUser(null);
      setIsAuthenticated(false);
      setAuthError(mapAuthError(error));
      setMustChangePassword(false);
      throw error;
    } finally {
      setIsLoadingAuth(false);
    }
  }

  async function checkUserAuth(sessionOverride = null, options = {}) {
    const { force = false } = options;

    if (!isSupabaseConfigured) {
      return runAccessValidation(null);
    }

    const sessionData = sessionOverride
      ? { data: { session: sessionOverride }, error: null }
      : await supabase.auth.getSession();
    const nextSession = sessionData?.data?.session || null;
    const nextToken = nextSession?.access_token || null;

    setIsLoadingAuth(true);

    if (sessionData?.error || !nextSession?.user || !nextToken) {
      clearAuthState();
      return null;
    }

    if (!force && validatedTokenRef.current === nextToken && userRef.current) {
      setSession(nextSession);
      setUser(userRef.current);
      setIsAuthenticated(true);
      setAuthError(null);
      setIsLoadingAuth(false);
      return userRef.current;
    }

    if (!force && inFlightValidationRef.current?.token === nextToken) {
      return inFlightValidationRef.current.promise;
    }

    const validationPromise = runAccessValidation(nextSession).finally(() => {
      if (inFlightValidationRef.current?.token === nextToken) {
        inFlightValidationRef.current = null;
      }
    });

    inFlightValidationRef.current = {
      token: nextToken,
      promise: validationPromise,
    };

    return validationPromise;
  }

  async function login(email, password, captchaToken) {
    assertSupabaseConfigured();
    const lock = await checkLoginLock(email, 'servicos');
    if (lock.locked) throw new Error(lock.message);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });
    if (error) {
      reportFailedLogin(email, 'servicos');
      throw new Error(getAuthErrorMessage(error) ?? 'Não foi possível entrar.');
    }
    reportLoginSuccess('servicos');
    return checkUserAuth(data?.session || null, { force: true });
  }

  async function changePassword(newPassword) {
    assertSupabaseConfigured();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw new Error(getAuthErrorMessage(error) ?? 'Nao foi possivel atualizar a senha.');
    }
    await financeiroApi.auth.clearPasswordChangeRequired();
    setMustChangePassword(false);
  }

  async function logout(redirectTo = '/entrar') {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut({ scope: 'local' });
    }
    clearAuthState();
    if (redirectTo && typeof window !== 'undefined') {
      window.history.replaceState({}, '', redirectTo);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      runAccessValidation(null).catch(() => null);
      return undefined;
    }

    let mounted = true;

    checkUserAuth().catch(() => null);

    const { data: subscription } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!mounted) return;

      if (event === 'SIGNED_OUT' || !nextSession) {
        clearAuthState();
        return;
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        try {
          await checkUserAuth(nextSession);
        } catch {
          return;
        }
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      session,
      user,
      isAuthenticated,
      isLoadingAuth,
      authError,
      mustChangePassword,
      login,
      logout,
      checkUserAuth,
      changePassword,
    }),
    [authError, isAuthenticated, isLoadingAuth, mustChangePassword, session, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
