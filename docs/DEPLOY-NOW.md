# Deploy now — victorgmor/carriera

Code is on GitHub: **https://github.com/victorgmor/carriera** (branch `main`)

## 1. Create App Runner service (~5 min)

1. Open [AWS App Runner — Create service](https://console.aws.amazon.com/apprunner/home#/create)
2. Sign in to your AWS account (create one at aws.amazon.com if needed)
3. **Source and deployment**
   - Repository type: **Source code repository**
   - Connect to **GitHub** → authorize AWS Connector for GitHub
   - Repository: `victorgmor/carriera`
   - Branch: `main`
   - Deployment trigger: **Automatic**
   - **Configuration source**: Repository configuration file
   - Configuration file: `apprunner.yaml`
4. **Build settings** — leave defaults (App Runner reads `apprunner.yaml`)
5. **Service settings**
   - Service name: `carriera`
   - CPU: 1 vCPU · Memory: 2 GB
   - Port: **8080**
6. **Environment variables** → Add (Runtime):
   ```
   POLY_BUILDER_API_KEY=...
   POLY_BUILDER_API_SECRET=...
   POLY_BUILDER_PASSPHRASE=...
   PUBLIC_POLY_BUILDER_CODE=...   (optional)
   ```
7. **Create & deploy** — first build takes ~5–10 minutes

When status is **Running**, open the **Default domain** URL.

## 2. Custom domain (after you buy one)

1. App Runner → your service → **Custom domains** → **Link domain**
2. Enter e.g. `app.yourdomain.com`
3. Add the CNAME records at your registrar
4. Update `site` in `astro.config.mjs` to `https://app.yourdomain.com` and push to `main` (auto redeploys)

## 3. Day-to-day updates

```bash
git push deploy main
```

Every push to `main` on GitHub triggers a new deploy.

## Remotes

| Remote   | URL |
|----------|-----|
| `origin` | Lexington-Themes/carriera (read-only for you) |
| `deploy` | victorgmor/carriera (push here for AWS) |

## If build fails

- App Runner → Service → **Logs** → Deployment logs
- Confirm `package-lock.json` is in the repo (it is)
- Confirm port **8080** matches `apprunner.yaml`
