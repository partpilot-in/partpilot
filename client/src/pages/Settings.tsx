import { FormEvent, useEffect, useState } from "react";
import { KeyRound, Save } from "lucide-react";
import { useSettingsMutations, useProfile, type UserProfile } from "../api/hooks/settings";
import { useAuth } from "../auth/AuthProvider";
import { Card, ErrorMessage, Spinner, useToast } from "../components/ui";

const emptyProfile: UserProfile = {
  email: "",
  first_name: "",
  last_name: "",
  job: "",
  company: "",
  linkedin: "",
};

function apiErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { error?: unknown } } }).response;
    if (typeof response?.data?.error === "string") return response.data.error;
  }
  return error instanceof Error ? error.message : "Please try again.";
}

export function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { data: profile, loading, error, refetch } = useProfile();
  const { updateProfile, requestPasswordReset } = useSettingsMutations();
  const { showToast } = useToast();
  const [form, setForm] = useState<UserProfile>(emptyProfile);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (profile) setForm(profile);
  }, [profile]);

  function updateField<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const emailChanged = form.email.trim().toLowerCase() !== (user?.email ?? "").trim().toLowerCase();
      const saved = await updateProfile(form);
      setForm(saved);
      refetch();
      try {
        await refreshUser();
      } catch {
        // The saved profile remains authoritative if session refresh is delayed.
      }
      showToast({
        title: "Settings saved",
        body: emailChanged
          ? "Check your inbox to confirm the new email address."
          : "Your profile has been updated.",
        tone: "success",
      });
    } catch (saveError) {
      showToast({ title: "Could not save settings", body: apiErrorMessage(saveError) });
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword() {
    setResetting(true);
    try {
      await requestPasswordReset(`${window.location.origin}/settings`);
      showToast({
        title: "Reset email sent",
        body: "Check your inbox for the secure password reset link.",
        tone: "success",
      });
    } catch (resetError) {
      showToast({ title: "Could not reset password", body: apiErrorMessage(resetError) });
    } finally {
      setResetting(false);
    }
  }

  if (loading) return <Spinner message="Loading settings..." />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="stack settings-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your profile and account security.</p>
        </div>
      </div>

      <div className="settings-grid">
        <Card title="Profile">
          <form className="settings-form" onSubmit={saveProfile}>
            <label className="field-label settings-form__wide">
              Email
              <input
                className="form-control"
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label className="field-label">
              First name
              <input
                className="form-control"
                value={form.first_name}
                onChange={(event) => updateField("first_name", event.target.value)}
                autoComplete="given-name"
                maxLength={100}
              />
            </label>
            <label className="field-label">
              Last name
              <input
                className="form-control"
                value={form.last_name}
                onChange={(event) => updateField("last_name", event.target.value)}
                autoComplete="family-name"
                maxLength={100}
              />
            </label>
            <label className="field-label">
              Job
              <input
                className="form-control"
                value={form.job}
                onChange={(event) => updateField("job", event.target.value)}
                autoComplete="organization-title"
                maxLength={160}
              />
            </label>
            <label className="field-label">
              Company
              <input
                className="form-control"
                value={form.company}
                onChange={(event) => updateField("company", event.target.value)}
                autoComplete="organization"
                maxLength={160}
              />
            </label>
            <label className="field-label settings-form__wide">
              LinkedIn
              <input
                className="form-control"
                type="url"
                value={form.linkedin}
                onChange={(event) => updateField("linkedin", event.target.value)}
                placeholder="https://www.linkedin.com/in/your-profile"
                autoComplete="url"
                maxLength={500}
              />
            </label>
            <div className="settings-form__actions">
              <button type="submit" className="button button--primary" disabled={saving}>
                <Save size={16} />
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </Card>

        <Card title="Password">
          <div className="settings-password">
            <p>We’ll email a secure reset link to your current sign-in address.</p>
            <button type="button" className="button" disabled={resetting} onClick={resetPassword}>
              <KeyRound size={16} />
              {resetting ? "Sending..." : "Reset password"}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
