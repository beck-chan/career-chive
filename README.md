# CareerChive

## App path

Installers choose where the app lives with `NEXT_PUBLIC_CAREERCHIVE_PATH` (no trailing slash). Default `/` is this repo as a standalone site.

- Standalone: omit the variable, or set `NEXT_PUBLIC_CAREERCHIVE_PATH=/`.
- Nested in a host (for example career-chive): `NEXT_PUBLIC_CAREERCHIVE_PATH=/beck`. Organizations is `{app}/organizations` (old `{app}/settings` redirects there); Archive, Overview, and Search nest under `{app}`.

Styles stay on the `.careerchive-app` wrapper (`careerchive-app-theme` in localStorage) so a host site’s theme is unchanged.

## GitHub Actions

The keep-alive workflow pings `settings?select=id&limit=1` so a free-tier project stays awake. `public.settings` is RLS-protected with no anon grant, so the publishable key cannot read it.

Set these as GitHub Actions repository secrets (Settings → Secrets and variables → Actions):

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY` — Data API secret (`sb_secret_…` from Publishable and secret API keys). Not the publishable/anon key. Not Legacy `service_role`.

The job fails if either is missing. An example workflow lives at [`.github/examples/supabase-keep-alive.yml.example`](.github/examples/supabase-keep-alive.yml.example).

