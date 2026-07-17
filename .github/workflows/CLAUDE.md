# .github/workflows/

GitHub Actions. `deploy.yml` builds (`npm ci && npm run build`) and publishes `dist/` to GitHub
Pages on every push to `master`.

- The `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` env vars here are public by design (the anon
  key ships in the browser bundle). The `service_role` key must NEVER appear here.
