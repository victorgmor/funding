# Deploy Carriera on AWS (GitHub → auto deploy)

Carriera is an **Astro 7 SSR app** (`@astrojs/node` standalone). The recommended setup is **AWS App Runner** connected to GitHub: every push to your branch rebuilds and deploys automatically.

## Prerequisites

- GitHub repo with this project
- AWS account
- Polymarket builder secrets (for gifts / relayer): `POLY_BUILDER_API_KEY`, `POLY_BUILDER_API_SECRET`, `POLY_BUILDER_PASSPHRASE`, optional `PUBLIC_POLY_BUILDER_CODE`

## Option A — App Runner + GitHub (recommended)

1. Push the repo to GitHub (include `apprunner.yaml` at the repo root).

2. In **AWS Console** → **App Runner** → **Create service**.

3. **Source**: Repository → Connect to GitHub → authorize AWS → select repo and branch (e.g. `main`).

4. **Deployment settings**:
   - Deployment trigger: **Automatic** (deploy on every push)
   - Configuration source: **Use a configuration file** → `apprunner.yaml`

5. **Service settings**:
   - CPU / memory: start with 1 vCPU, 2 GB
   - Port: **8080** (matches `apprunner.yaml` and the Node adapter default)

6. **Environment variables** (Runtime → Add):
   | Name | Notes |
   |------|--------|
   | `POLY_BUILDER_API_KEY` | Server secret |
   | `POLY_BUILDER_API_SECRET` | Server secret |
   | `POLY_BUILDER_PASSPHRASE` | Server secret |
   | `PUBLIC_POLY_BUILDER_CODE` | Public, optional |

7. Create the service. First deploy runs `npm ci`, `npm run build`, then `npm start`.

8. Optional: add a custom domain in App Runner → Custom domains.

### After deploy

- App URL: `https://<id>.<region>.awsapprunner.com`
- Update `site` in `astro.config.mjs` to your production URL (sitemap / SEO).

### Workflow

```
git push origin main  →  App Runner detects push  →  build  →  deploy
```

No separate CI required unless you want tests on pull requests.

---

## Option B — Docker (ECS / App Runner container)

Use the included `Dockerfile` if you prefer ECR + App Runner (container image) or ECS Fargate:

```bash
docker build -t carriera .
docker run -p 8080:8080 --env-file .env carriera
```

Wire GitHub Actions or App Runner **image repository** for the same push-to-deploy flow.

---

## Important: user-created bundles storage

`data/user-funds.json` is **local filesystem** storage. On App Runner, the disk is **ephemeral** — user-published bundles can be **lost on redeploy**.

For production persistence, plan one of:

- **Amazon S3** — replace file reads/writes in `src/lib/funds/store.ts`
- **Amazon RDS / DynamoDB** — if you outgrow a single JSON file

Seed bundles from `src/data/funds.ts` are always included in the build.

---

## Local production check

```bash
npm ci
npm run build
HOST=0.0.0.0 PORT=8080 npm start
```

Open `http://localhost:8080`.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails on App Runner | Check build logs; ensure `package-lock.json` is committed |
| 502 / health check | Confirm port **8080** and `HOST=0.0.0.0` |
| Gifts fail | Set all `POLY_BUILDER_*` env vars on the service |
| Polymarket API errors | Server must reach `gamma-api.polymarket.com` (no regional block) |
