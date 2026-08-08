import { api } from "../client";
import { useAsync } from "./useAsync";

export interface UserProfile {
  email: string;
  first_name: string;
  last_name: string;
  job: string;
  company: string;
  linkedin: string;
}

export function useProfile() {
  return useAsync<UserProfile>(
    () => api.get("/v1/settings/profile").then((response) => response.data as UserProfile),
    [],
  );
}

export function useSettingsMutations() {
  async function updateProfile(profile: UserProfile): Promise<UserProfile> {
    const response = await api.patch("/v1/settings/profile", profile);
    return response.data as UserProfile;
  }

  async function requestPasswordReset(redirectTo: string): Promise<void> {
    await api.post("/v1/settings/reset-password", { redirect_to: redirectTo });
  }

  return { updateProfile, requestPasswordReset };
}
