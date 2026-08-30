import { api } from "../client";
import { useAsync } from "./useAsync";

export interface UserProfile {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  job: string;
  company: string;
  organization_slug: string;
  github: string;
  linkedin: string;
  billing_plan: "hobby" | "startup" | "scale" | "enterprise";
}

export type EditableUserProfile = Omit<
  UserProfile,
  "organization_slug" | "billing_plan"
>;

const billingPlans: ReadonlySet<UserProfile["billing_plan"]> = new Set([
  "hobby",
  "startup",
  "scale",
  "enterprise",
]);

function readString(data: Record<string, unknown>, key: string) {
  return typeof data[key] === "string" ? data[key] : "";
}

function normalizeProfile(value: unknown): UserProfile {
  const data =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const plan = data.billing_plan;

  return {
    email: readString(data, "email"),
    first_name: readString(data, "first_name"),
    last_name: readString(data, "last_name"),
    phone: readString(data, "phone"),
    job: readString(data, "job"),
    company: readString(data, "company"),
    organization_slug: readString(data, "organization_slug"),
    github: readString(data, "github"),
    linkedin: readString(data, "linkedin"),
    billing_plan:
      typeof plan === "string" &&
      billingPlans.has(plan as UserProfile["billing_plan"])
        ? (plan as UserProfile["billing_plan"])
        : "hobby",
  };
}

export function useProfile() {
  return useAsync<UserProfile>(
    () =>
      api
        .get("/v1/settings/profile")
        .then((response) => normalizeProfile(response.data)),
    [],
  );
}

export function useSettingsMutations() {
  async function updateProfile(
    profile: EditableUserProfile,
  ): Promise<UserProfile> {
    const response = await api.patch("/v1/settings/profile", profile);
    return normalizeProfile(response.data);
  }

  async function requestPasswordReset(redirectTo: string): Promise<void> {
    await api.post("/v1/settings/reset-password", { redirect_to: redirectTo });
  }

  return { updateProfile, requestPasswordReset };
}
