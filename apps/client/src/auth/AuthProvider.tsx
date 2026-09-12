import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export interface AppUser {
  id: string;
  email: string;
  name: string;
  organizationName: string;
  organizationSlug: string;
  avatarUrl?: string;
}

interface AuthContextValue {
  user: AppUser | null;
  session: Session | null;
  loading: boolean;
  isConfigured: boolean;
  passwordRecovery: boolean;
  passwordRecoveryError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<SignUpResult>;
  requestPasswordReset: (email: string, redirectTo: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  cancelPasswordRecovery: () => void;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

interface SignUpInput {
  email: string;
  password: string;
  name: string;
  organizationName: string;
}

interface SignUpResult {
  needsEmailConfirmation: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const passwordRecoveryStorageKey = "partpilot_password_recovery";

interface AuthCallbackParameters {
  accessToken: string | null;
  refreshToken: string | null;
  recovery: boolean;
  error: string | null;
  hasAuthParameters: boolean;
}

function readAuthCallbackParameters(): AuthCallbackParameters {
  const hashParameters = new URLSearchParams(window.location.hash.slice(1));
  const queryParameters = new URLSearchParams(window.location.search);
  const type = hashParameters.get("type") ?? queryParameters.get("type");
  const error =
    hashParameters.get("error_description") ??
    queryParameters.get("error_description");
  const accessToken = hashParameters.get("access_token");
  const refreshToken = hashParameters.get("refresh_token");

  return {
    accessToken,
    refreshToken,
    recovery:
      type === "recovery" || window.location.pathname === "/reset-password",
    error,
    hasAuthParameters: Boolean(accessToken || refreshToken || type || error),
  };
}

function clearAuthCallbackParameters() {
  if (!window.location.hash) return;
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
}

function readPasswordRecoveryState() {
  const callback = readAuthCallbackParameters();
  const active =
    sessionStorage.getItem(passwordRecoveryStorageKey) === "true" ||
    callback.recovery;

  if (active) sessionStorage.setItem(passwordRecoveryStorageKey, "true");
  return active;
}

function storePasswordRecoveryState(active: boolean) {
  if (active) {
    sessionStorage.setItem(passwordRecoveryStorageKey, "true");
  } else {
    sessionStorage.removeItem(passwordRecoveryStorageKey);
  }
}

function readMetadataString(metadata: User["user_metadata"], key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function organizationNameToSlug(value: string) {
  return normalizeSlug(value);
}

function getAppUser(user: User): AppUser {
  const email = user.email ?? "";
  const name =
    readMetadataString(user.user_metadata, "full_name") ??
    readMetadataString(user.user_metadata, "name") ??
    email ??
    "User";
  const organizationSlug =
    readMetadataString(user.user_metadata, "organization_slug") ??
    readMetadataString(user.user_metadata, "org_slug") ??
    "personal";
  const organizationName =
    readMetadataString(user.user_metadata, "organization_name") ??
    readMetadataString(user.user_metadata, "org_name") ??
    readMetadataString(user.user_metadata, "company") ??
    "";
  const avatarUrl =
    readMetadataString(user.user_metadata, "avatar_url") ??
    readMetadataString(user.user_metadata, "picture");

  return {
    id: user.id,
    email,
    name,
    organizationName,
    organizationSlug,
    avatarUrl,
  };
}

function syncAccessToken(session: Session | null) {
  if (session?.access_token) {
    localStorage.setItem("supabase_access_token", session.access_token);
    return;
  }

  localStorage.removeItem("supabase_access_token");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(
    readPasswordRecoveryState,
  );
  const [passwordRecoveryError, setPasswordRecoveryError] = useState<
    string | null
  >(null);

  useEffect(() => {
    const authClient = supabase;
    if (!authClient) {
      syncAccessToken(null);
      storePasswordRecoveryState(false);
      setPasswordRecovery(false);
      setLoading(false);
      return;
    }
    const auth = authClient.auth;

    let active = true;
    const callback = readAuthCallbackParameters();

    const {
      data: { subscription },
    } = auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") {
        storePasswordRecoveryState(true);
        setPasswordRecovery(true);
        setPasswordRecoveryError(null);
      } else if (event === "SIGNED_OUT") {
        storePasswordRecoveryState(false);
        setPasswordRecovery(false);
        setPasswordRecoveryError(null);
      }
      setSession(nextSession);
      syncAccessToken(nextSession);
      if (!callback.recovery || event === "PASSWORD_RECOVERY")
        setLoading(false);
    });

    async function initializeSession() {
      try {
        if (callback.error) throw new Error(callback.error);

        let nextSession: Session | null;
        if (callback.accessToken || callback.refreshToken) {
          if (!callback.accessToken || !callback.refreshToken) {
            throw new Error(
              "This password reset link is incomplete. Please request a new one.",
            );
          }
          const { data, error } = await auth.setSession({
            access_token: callback.accessToken,
            refresh_token: callback.refreshToken,
          });
          if (error) throw error;
          nextSession = data.session;
        } else {
          const { data, error } = await auth.getSession();
          if (error) throw error;
          nextSession = data.session;
        }

        if (!active) return;

        if (callback.recovery) {
          if (!nextSession)
            throw new Error(
              "This password reset link is invalid or has expired.",
            );
          storePasswordRecoveryState(true);
          setPasswordRecovery(true);
          setPasswordRecoveryError(null);
        } else if (!nextSession) {
          storePasswordRecoveryState(false);
          setPasswordRecovery(false);
          setPasswordRecoveryError(null);
        }

        setSession(nextSession);
        syncAccessToken(nextSession);
      } catch (caught) {
        if (!active) return;

        syncAccessToken(null);
        if (callback.recovery) {
          storePasswordRecoveryState(true);
          setPasswordRecovery(true);
          setPasswordRecoveryError(
            caught instanceof Error
              ? caught.message
              : "This password reset link is invalid or has expired.",
          );
        }
      } finally {
        if (callback.hasAuthParameters) clearAuthCallbackParameters();
        if (active) setLoading(false);
      }
    }

    void initializeSession();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error("Supabase is not configured.");

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;

    setSession(data.session);
    syncAccessToken(data.session);
    storePasswordRecoveryState(false);
    setPasswordRecovery(false);
    setPasswordRecoveryError(null);
  }, []);

  const signUp = useCallback(
    async ({ email, password, name, organizationName }: SignUpInput) => {
      if (!supabase) throw new Error("Supabase is not configured.");

      const organization = organizationName.trim();
      const slug = organizationNameToSlug(organization) || "personal";
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name.trim(),
            organization_name: organization,
            organization_slug: slug,
          },
        },
      });

      if (error) throw error;

      setSession(data.session);
      syncAccessToken(data.session);
      return { needsEmailConfirmation: !data.session };
    },
    [],
  );

  const requestPasswordReset = useCallback(
    async (email: string, redirectTo: string) => {
      if (!supabase) throw new Error("Supabase is not configured.");

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (error) throw error;
    },
    [],
  );

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) throw new Error("Supabase is not configured.");

    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) throw error;

    setSession((current) =>
      current ? { ...current, user: data.user } : current,
    );
    storePasswordRecoveryState(false);
    setPasswordRecovery(false);
    setPasswordRecoveryError(null);
  }, []);

  const cancelPasswordRecovery = useCallback(() => {
    storePasswordRecoveryState(false);
    setPasswordRecovery(false);
    setPasswordRecoveryError(null);
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) {
      syncAccessToken(null);
      storePasswordRecoveryState(false);
      setPasswordRecovery(false);
      setPasswordRecoveryError(null);
      setSession(null);
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    setSession(null);
    syncAccessToken(null);
    storePasswordRecoveryState(false);
    setPasswordRecovery(false);
    setPasswordRecoveryError(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.auth.refreshSession();
    if (error) throw error;
    setSession(data.session);
    syncAccessToken(data.session);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ? getAppUser(session.user) : null,
      session,
      loading,
      isConfigured: isSupabaseConfigured,
      passwordRecovery,
      passwordRecoveryError,
      signIn,
      signUp,
      requestPasswordReset,
      updatePassword,
      cancelPasswordRecovery,
      signOut,
      refreshUser,
    }),
    [
      cancelPasswordRecovery,
      loading,
      passwordRecovery,
      passwordRecoveryError,
      refreshUser,
      requestPasswordReset,
      session,
      signIn,
      signOut,
      signUp,
      updatePassword,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
