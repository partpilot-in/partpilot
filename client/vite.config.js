import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
var envDir = "..";
var requiredClientEnv = [
    "VITE_API_BASE_URL",
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
];
export default defineConfig(function (_a) {
    var mode = _a.mode;
    // Railway injects service variables into the build process. loadEnv merges
    // those with the root .env used for local development, with process values
    // taking precedence.
    var env = loadEnv(mode, envDir, "");
    var missing = requiredClientEnv.filter(function (name) { var _a; return !((_a = env[name]) === null || _a === void 0 ? void 0 : _a.trim()); });
    if (missing.length) {
        throw new Error("Missing required client environment variables: ".concat(missing.join(", ")));
    }
    return {
        envDir: envDir,
        plugins: [react()],
        server: {
            host: "127.0.0.1",
            port: 5173,
        },
    };
});
