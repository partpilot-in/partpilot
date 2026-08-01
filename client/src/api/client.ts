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
  let token = localStorage.getItem("supabase_access_token");

  if (!token && supabase) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? null;
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
