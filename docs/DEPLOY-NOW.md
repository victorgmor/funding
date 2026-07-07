# Deploy Carriera — ECS Express Mode (GitHub auto-deploy)

App Runner no longer accepts new customers (April 2026). Use **Amazon ECS Express Mode** instead — same idea: push to GitHub, AWS deploys.

## One-time setup

### 1. Run the AWS setup script

```bash
chmod +x scripts/aws-ecs-express-setup.sh
./scripts/aws-ecs-express-setup.sh
```

Requires `aws login` (already done).

### 2. Add GitHub Actions variables

Repo: **https://github.com/victorgmor/carriera** → Settings → Secrets and variables → Actions → **Variables**:

| Variable | Value |
|----------|--------|
| `AWS_REGION` | `eu-west-1` |
| `AWS_ACCOUNT_ID` | `811345154091` |
| `ECR_REPOSITORY` | `carriera` |
| `ECS_SERVICE` | `carriera` |
| `ECS_CLUSTER` | `default` |

### 3. Enable Actions

Actions tab → enable workflows if prompted.

### 4. Push to deploy

```bash
git push deploy main
```

Workflow: `.github/workflows/deploy.yml` — builds Docker, pushes to ECR, deploys ECS Express.

You'll get a URL like `https://xxxxx.eu-west-1.on.aws`.

### 5. Environment variables (Polymarket)

After first deploy, in **ECS Console** → Express service → **Update** → add:

- `POLY_BUILDER_API_KEY`
- `POLY_BUILDER_API_SECRET`
- `POLY_BUILDER_PASSPHRASE`
- `PUBLIC_POLY_BUILDER_CODE` (optional)

Or re-deploy with env vars in the GitHub Action once configured.

## Custom domain

ECS Express → **Custom domains** → link your domain → add DNS records at registrar.

Update `site` in `astro.config.mjs` to your production URL.

## Updates

Every push to `main` redeploys automatically.

## Legacy

`apprunner.yaml` is kept for reference but **do not use App Runner** for new deployments.
