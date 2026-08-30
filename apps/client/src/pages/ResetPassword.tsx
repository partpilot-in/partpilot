import { FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Spinner, useToast } from "../components/ui";

export function ResetPassword() {
  const {
    cancelPasswordRecovery,
    loading,
    passwordRecoveryError,
    session,
    updatePassword,
  } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmedPassword, setConfirmedPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword !== confirmedPassword) {
      showToast({
        title: "Passwords do not match",
        body: "Enter the same password in both fields.",
      });
      return;
    }

    setSubmitting(true);
    try {
      await updatePassword(newPassword);
      showToast({
        title: "Password updated",
        body: "Your new password is ready to use.",
        tone: "success",
      });
      navigate("/dashboard", { replace: true });
    } catch (caught) {
      showToast({
        title: "Could not update password",
        body:
          caught instanceof Error
            ? caught.message
            : "Please request a new password reset link and try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function returnToSignIn() {
    cancelPasswordRecovery();
    navigate("/", { replace: true });
  }

  if (loading) {
    return (
      <main className="auth-shell">
        <Spinner message="Verifying reset link" />
      </main>
    );
  }

  const linkError =
    passwordRecoveryError ??
    (!session ? "This password reset link is invalid or has expired." : null);

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="reset-password-title">
        <div className="auth-brand">
          <img className="brand-mark" src="/pp-logo-light.png" alt="" />
          <span>PartPilot</span>
        </div>
        <div className="auth-card">
          <div className="auth-copy">
            <h1 id="reset-password-title">Set new password</h1>
            <p>Choose a new password for your PartPilot account.</p>
          </div>

          {linkError ? (
            <>
              <p className="auth-error" role="alert">
                {linkError}
              </p>
              <button
                type="button"
                className="button auth-submit"
                onClick={returnToSignIn}
              >
                Return to sign in
              </button>
            </>
          ) : (
            <form className="auth-form" onSubmit={submit}>
              <label className="field-label">
                New password
                <input
                  className="form-control"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>
              <label className="field-label">
                Confirm new password
                <input
                  className="form-control"
                  type="password"
                  value={confirmedPassword}
                  onChange={(event) => setConfirmedPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>
              <button
                type="submit"
                className="button button--primary auth-submit"
                disabled={submitting}
              >
                <KeyRound size={18} />
                {submitting ? "Updating..." : "Set new password"}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
