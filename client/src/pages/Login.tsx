import { FormEvent, useState } from "react";
import { LogIn } from "lucide-react";
import { organizationNameToSlug, useAuth } from "../auth/AuthProvider";

type AuthMode = "login" | "signup";

export function Login() {
  const { isConfigured, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const organizationSlug = organizationNameToSlug(organizationName);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!isConfigured) {
      setError("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to the deployment environment or repository .env file.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "login") {
        await signIn(email, password);
      } else {
        const result = await signUp({ email, password, name, organizationName });
        if (result.needsEmailConfirmation) {
          setMode("login");
          setNotice("Account created. Check your email to confirm it before signing in.");
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to continue. Check the details and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-brand">
          <img className="brand-mark" src="/PP Logo - Light.png" alt="" />
          <span>PartPilot</span>
        </div>
        <div className="auth-card">
          <div className="auth-copy">
            <h1 id="auth-title">{mode === "login" ? "Sign in" : "Create account"}</h1>
            <p>{mode === "login" ? "Use your PartPilot account to open the workspace." : "Create a PartPilot account for this workspace."}</p>
          </div>

          <form className="auth-form" onSubmit={submit}>
            {mode === "signup" && (
              <>
                <label className="field-label">
                  Name
                  <input
                    className="form-control"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    required
                  />
                </label>
                <label className="field-label">
                  Organization name
                  <input
                    className="form-control"
                    value={organizationName}
                    onChange={(event) => setOrganizationName(event.target.value)}
                    autoComplete="organization"
                    required
                  />
                  {organizationSlug && <span className="auth-slug-preview">Used slug {organizationSlug}</span>}
                </label>
              </>
            )}

            <label className="field-label">
              Email
              <input
                className="form-control"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>

            <label className="field-label">
              Password
              <input
                className="form-control"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={6}
                required
              />
            </label>

            {notice && <p className="auth-notice">{notice}</p>}
            {error && <p className="auth-error">{error}</p>}

            <button type="submit" className="button button--primary auth-submit" disabled={submitting}>
              <LogIn size={18} />
              {submitting ? "Working..." : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <button
            type="button"
            className="auth-switch"
            onClick={() => {
              setError(null);
              setNotice(null);
              setMode((current) => (current === "login" ? "signup" : "login"));
            }}
          >
            {mode === "login" ? "Create a new account" : "Use an existing account"}
          </button>
        </div>
      </section>
    </main>
  );
}
