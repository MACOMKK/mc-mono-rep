import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { crmApi } from '@macom/api-client/crmApi';
import {
  assertSupabaseConfigured,
  checkLoginLock,
  getAuthErrorMessage,
  isSupabaseConfigured,
  reportFailedLogin,
  reportLoginSuccess,
  supabase,
} from '@macom/api-client/supabaseClient';

import { queryClientInstance } from './query-client';

const AuthContext = createContext(null);

function mapAccessLevel(level) {
  if (level === 'admin') return 'admin';
  if (level === 'gestor') return 'manager';
  return 'user';
}

function normalizeCrmUser(authUser, authPayload = {}) {
  const collaborator = authPayload.row || null;
  const access = authPayload.access || null;

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
    role: mapAccessLevel(access?.nivel_acesso),
    central_role: collaborator?.funcao || null,
    unit_id: collaborator?.unidade_id || null,
    unit_name: collaborator?.unidade_nome || '',
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
      message: error.message || 'Faca login para acessar o CRM.',
    };
  }

  if (error?.status === 403) {
    return {
      type: 'access_denied',
      message: error.message || 'Seu usuario nao possui acesso liberado ao CRM.',
    };
  }

  return {
    type: 'unknown',
    message: error?.message || 'Nao foi possivel validar o acesso ao CRM.',
  };
}

// 401/403 do `me` significam sessao invalida ou sem acesso -- ai sim derruba a sessao. Qualquer
// outra falha (timeout, rede, 5xx -- comuns com a Edge Function em sa-east-1 e o banco em
// us-west-2) e transitoria e nao pode deslogar nem esvaziar a tela do usuario.
function isDefinitiveAuthFailure(error) {
  return error?.status === 401 || error?.status === 403;
}

async function fetchMeWithRetry(accessToken) {
  try {
    return await crmApi.auth.me(accessToken);
  } catch (error) {
    if (isDefinitiveAuthFailure(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 800));
    return crmApi.auth.me(accessToken);
  }
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

  async function runCrmAccessValidation(nextSession, { silent = false } = {}) {
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
      const authPayload = await fetchMeWithRetry(nextSession.access_token);
      const currentUser = normalizeCrmUser(nextSession.user, authPayload);

      if (!currentUser.active) {
        const accessError = new Error('Seu usuario nao possui acesso ativo ao CRM.');
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
      // Revalidacao em segundo plano (renovacao de token) de um usuario ja autenticado: falha
      // transitoria mantem a sessao e a tela como estao; a proxima revalidacao tenta de novo.
      if (silent && userRef.current && !isDefinitiveAuthFailure(error)) {
        setSession(nextSession);
        return userRef.current;
      }

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
      return runCrmAccessValidation(null);
    }

    const sessionData = sessionOverride
      ? { data: { session: sessionOverride }, error: null }
      : await supabase.auth.getSession();
    const nextSession = sessionData?.data?.session || null;
    const nextToken = nextSession?.access_token || null;

    // Usuario ja autenticado revalidando (ex.: TOKEN_REFRESHED): nao liga o loading global,
    // senao o CrmRoutes troca o app inteiro por um spinner e perde o estado das telas.
    const silent = !force && Boolean(userRef.current);
    if (!silent) setIsLoadingAuth(true);

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

    const validationPromise = runCrmAccessValidation(nextSession, { silent }).finally(() => {
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
    const lock = await checkLoginLock(email, 'crm');
    if (lock.locked) throw new Error(lock.message);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });
    if (error) {
      reportFailedLogin(email, 'crm');
      throw new Error(getAuthErrorMessage(error) ?? 'Não foi possível entrar no CRM.');
    }
    reportLoginSuccess('crm');
    return checkUserAuth(data?.session || null, { force: true });
  }

  async function changePassword(newPassword) {
    assertSupabaseConfigured();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw new Error(getAuthErrorMessage(error) ?? 'Nao foi possivel atualizar a senha.');
    }
    await crmApi.auth.clearPasswordChangeRequired();
    setMustChangePassword(false);
  }

  async function logout(redirectTo = '/entrar') {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut({ scope: 'local' });
    }
    clearAuthState();
    queryClientInstance.clear();
    if (redirectTo && typeof window !== 'undefined') {
      window.history.replaceState({}, '', redirectTo);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      runCrmAccessValidation(null).catch(() => null);
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
