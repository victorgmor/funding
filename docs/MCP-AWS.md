# Connect AWS Deployments MCP

The **Deploy on AWS** plugin adds three MCP servers. Two need `uvx` (now installed); one is cloud-hosted.

| Server | Type | Purpose |
|--------|------|---------|
| **awsknowledge** | HTTPS | AWS docs, architecture guidance |
| **awspricing** | local (`uvx`) | Cost estimates |
| **awsiac** | local (`uvx`) | IaC best practices (CDK/CloudFormation) |

## 1. Restart Cursor

After installing `uv`, **fully quit and reopen Cursor** so MCP can find:

```
/Users/victor/.local/bin/uvx
```

Your `~/.zshrc` already adds this to PATH.

## 2. Verify MCP status

**Cursor Settings → MCP**

You should see four AWS-related servers:

| Server | Status |
|--------|--------|
| `awsknowledge` | HTTPS — works without local install |
| `awsiac` | via `uvx` — added to `~/.cursor/mcp.json` |
| `awspricing` | via `uvx` — added to `~/.cursor/mcp.json` |

After editing `mcp.json`, **reload Cursor** (Cmd+Shift+P → “Developer: Reload Window”).

If `awsiac` / `awspricing` still error, confirm command is:

```
/Users/victor/.local/bin/uvx
```

## 3. AWS credentials (for deploy actions)

MCP can recommend architecture and costs without AWS login. **Actually deploying** needs credentials:

```bash
aws configure
# or
aws login
```

Then verify:

```bash
aws sts get-caller-identity
```

## 4. Diagram hook dependency

Installed: `defusedxml` (for architecture diagram validation).

## 5. Try it in chat

- “Estimate AWS cost for Carriera on App Runner”
- “Generate architecture diagram for this Astro SSR app”
- “Deploy my app to AWS” (uses deploy skill + MCP)

## Note on App Runner

The plugin’s deploy skill prefers **ECS Express Mode** or **Elastic Beanstalk** over App Runner (maintenance mode). Your repo already has `apprunner.yaml` — both paths work; ask the agent to compare if you want to switch.
