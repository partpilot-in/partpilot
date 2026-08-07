import axios from "axios";
import { supabase } from "../lib/supabase";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8080";

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(async (config) => {
  let token: string | null = null;

  if (supabase) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? null;
  }

  token ??= localStorage.getItem("supabase_access_token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config as (typeof error.config & { _partpilotAuthRetried?: boolean }) | undefined;
    if (error.response?.status !== 401 || !supabase || !config || config._partpilotAuthRetried) {
      return Promise.reject(error);
    }

    config._partpilotAuthRetried = true;
    const { data, error: refreshError } = await supabase.auth.refreshSession();
    const token = data.session?.access_token;
    if (refreshError || !token) return Promise.reject(error);

    localStorage.setItem("supabase_access_token", token);
    config.headers.Authorization = `Bearer ${token}`;
    return api(config);
  },
);
