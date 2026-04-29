import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      // Proxy para resolver CORS com a API pública do DataJud (CNJ)
      "/datajud-api": {
        target: "https://api-publica.datajud.cnj.jus.br",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/datajud-api/, ""),
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(
    Boolean
  ),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
