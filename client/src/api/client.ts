export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== "false";
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8080";

export function assertMockMode() {
  if (!USE_MOCKS) {
    throw new Error(
      `Live API mode is not wired yet. Set VITE_USE_MOCKS=true or implement fetch calls against ${API_BASE_URL}.`,
    );
  }
}
