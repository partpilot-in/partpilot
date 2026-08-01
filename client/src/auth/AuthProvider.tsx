import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export interface AppUser {
  id: string;
  email: string;
  name: string;
  organizationSlug: string;
  avatarUrl?: string;
}

interface AuthContextValue {
  user: AppUser | null;
  session: Session | null;
  loading: boolean;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
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
  const avatarUrl =
    readMetadataString(user.user_metadata, "avatar_url") ??
    readMetadataString(user.user_metadata, "picture");

  return {
    id: user.id,
    email,
    name,
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

  useEffect(() => {
    if (!supabase) {
      syncAccessToken(null);
      setLoading(false);
      return;
    }

    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        syncAccessToken(data.session);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        syncAccessToken(null);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      syncAccessToken(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error("Supabase is not configured.");

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    setSession(data.session);
    syncAccessToken(data.session);
  }, []);

  const signUp = useCallback(async ({ email, password, name, organizationName }: SignUpInput) => {
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
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) {
      syncAccessToken(null);
      setSession(null);
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    setSession(null);
    syncAccessToken(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ? getAppUser(session.user) : null,
      session,
      loading,
      isConfigured: isSupabaseConfigured,
      signIn,
      signUp,
      signOut,
    }),
    [loading, session, signIn, signOut, signUp],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
