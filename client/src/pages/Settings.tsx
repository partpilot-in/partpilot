import { FormEvent, useEffect, useState } from "react";
import { Check, CreditCard, KeyRound, Save } from "lucide-react";
import { useSettingsMutations, useProfile, type UserProfile } from "../api/hooks/settings";
import { useAuth } from "../auth/AuthProvider";
import { Card, ErrorMessage, Spinner, useToast } from "../components/ui";

const emptyProfile: UserProfile = {
  email: "",
  first_name: "",
  last_name: "",
  phone: "",
  job: "",
  company: "",
  organization_slug: "personal",
  github: "",
  linkedin: "",
  billing_plan: "hobby",
};

const availablePlans = ["startup", "scale", "enterprise"] as const;

function planName(plan: unknown) {
  const safePlan =
    typeof plan === "string" && ["hobby", "startup", "scale", "enterprise"].includes(plan)
      ? plan
      : "hobby";
  return safePlan.charAt(0).toUpperCase() + safePlan.slice(1);
}

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
    if (profile) {
      setForm({
        ...profile,
        organization_slug: profile.organization_slug || user?.organizationSlug || "personal",
      });
    }
  }, [profile, user?.organizationSlug]);

  function updateField<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const emailChanged = form.email.trim().toLowerCase() !== (user?.email ?? "").trim().toLowerCase();
      const saved = await updateProfile({
        email: form.email,
        first_name: form.first_name,
        last_name: form.last_name,
        phone: form.phone,
        job: form.job,
        company: form.company,
        github: form.github,
        linkedin: form.linkedin,
      });
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
              Phone number
              <input
                className="form-control"
                type="tel"
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                autoComplete="tel"
                maxLength={40}
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
            <label className="field-label">
              Organisation slug
              <input
                className="form-control form-control--readonly"
                value={form.organization_slug}
                readOnly
                aria-readonly="true"
              />
            </label>
            <label className="field-label settings-form__wide">
              Job
              <input
                className="form-control"
                value={form.job}
                onChange={(event) => updateField("job", event.target.value)}
                autoComplete="organization-title"
                maxLength={160}
              />
            </label>
            <label className="field-label settings-form__wide">
              GitHub
              <input
                className="form-control"
                type="url"
                value={form.github}
                onChange={(event) => updateField("github", event.target.value)}
                placeholder="https://github.com/your-profile"
                autoComplete="url"
                maxLength={500}
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

        <Card title="Billing">
          <div className="billing-settings">
            <div className="billing-current">
              <span className="billing-current__icon" aria-hidden="true">
                <CreditCard size={20} />
              </span>
              <span>
                <span className="billing-current__eyebrow">Current plan</span>
                <strong>{planName(form.billing_plan)}</strong>
              </span>
              <span className="billing-current__status">
                <Check size={14} aria-hidden="true" />
                Active
              </span>
            </div>

            <div className="billing-plans">
              <div>
                <h3>Available plans</h3>
                <p>Enjoy complimentary access to PartPilot during our launch trial.</p>
              </div>
              <ul className="billing-plan-list">
                {availablePlans.map((plan) => (
                  <li key={plan}>
                    <span>
                      <strong>{planName(plan)}</strong>
                    </span>
                    <button type="button" className="button" disabled>
                      Coming soon
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
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
