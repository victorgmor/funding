# Deploy Carriera — ECS Express Mode (GitHub auto-deploy)

App Runner no longer accepts new customers (April 2026). Use **Amazon ECS Express Mode** instead — same idea: push to GitHub, AWS deploys.

## Connect to AWS

You need AWS credentials **once** to bootstrap IAM and DynamoDB. After that, GitHub Actions deploys automatically.

### Option A — Local CLI (recommended)

```bash
npm run aws:login      # opens browser login, refreshes expired sessions
npm run aws:doctor     # checks tables + IAM policies
npm run aws:setup      # one-time bootstrap (safe to re-run)
```

If `aws login` fails, install/update AWS CLI v2: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html

### Option B — AWS CloudShell (no local CLI)

1. Open https://console.aws.amazon.com → switch region to **eu-west-1**
2. Click **CloudShell** (terminal icon, top bar)
3. Run:

```bash
git clone https://github.com/victorgmor/carriera.git
cd carriera
chmod +x scripts/*.sh
./scripts/aws-ecs-express-setup.sh
./scripts/aws-doctor.sh
```

CloudShell uses your console login — no `aws login` expiry issues.

### Fix IAM without local AWS CLI

If bundle save shows `not authorized to perform: dynamodb:PutItem on carriera-challenges`:

1. Use **Option B** above, or run locally after `npm run aws:login`
2. Re-run `./scripts/aws-ecs-express-setup.sh` — it updates IAM policies and attaches them to ECS roles
3. Verify with `./scripts/aws-doctor.sh`
4. Retry bundle create — no redeploy needed

## One-time setup

### 1. Run the AWS setup script

```bash
chmod +x scripts/aws-ecs-express-setup.sh
./scripts/aws-ecs-express-setup.sh
```

Or use CloudShell (see above).

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
