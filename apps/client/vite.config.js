import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
const envDir = "../..";
const requiredClientEnv = [
    "VITE_API_BASE_URL",
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
];
export default defineConfig(({ mode }) => {
    // Railway injects service variables into the build process. loadEnv merges
    // those with the root .env used for local development, with process values
    // taking precedence.
    const env = loadEnv(mode, envDir, "");
    const missing = requiredClientEnv.filter((name) => !env[name]?.trim());
    if (missing.length) {
        throw new Error(`Missing required client environment variables: ${missing.join(", ")}`);
    }
    return {
        envDir,
        plugins: [react()],
        server: {
            host: "127.0.0.1",
            port: 5173,
        },
    };
});
