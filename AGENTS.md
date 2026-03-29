# AGENTS.md — Carriera (Lexington Themes)

**Carriera** (`@lexington/carriera`) is a multipage Astro job-board and hiring template: landing sections for featured jobs, categories, companies, and candidates, plus blog, help center, team bios, auth-style pages (`sign-in`, `sign-up`, `reset-password`), pricing, contact, and job/candidate/company submission flows. Primary use case: **SaaS or marketing sites for recruiting / job marketplaces**.

## Tech stack

| Area | Details |
|------|---------|
| Framework | **Astro** `^6.0.0` ([`astro.config.mjs`](astro.config.mjs)) |
| Styling | **Tailwind CSS** `^4.1.18` via **`@tailwindcss/vite`**; plugins in [`src/styles/global.css`](src/styles/global.css): `@tailwindcss/typography`, `@tailwindcss/forms`, `tailwind-scrollbar-hide` |
| Content / MD | **`@astrojs/mdx`** `^5.0.0`; Markdown drafts + Shiki `css-variables` ([`astro.config.mjs`](astro.config.mjs)) |
| RSS / sitemap | **`@astrojs/rss`** `^4.0.14`, **`@astrojs/sitemap`** `^3.6.0` |
| SEO component | **`@lexingtonthemes/seo`** `^0.1.0` ([`src/components/fundations/head/Seo.astro`](src/components/fundations/head/Seo.astro)) |
| Aliases | `@/*` → `src/*` ([`tsconfig.json`](tsconfig.json)) |

## Folder map

| Path | Role |
|------|------|
| [`src/pages/`](src/pages/) | File-based routes: home, blog, jobs tags, help center, team, legal, auth, pricing, system UI gallery, `rss.xml.js`, etc. |
| [`src/layouts/`](src/layouts/) | `BaseLayout`, `BlogLayout`, `JobsLayout`, `LegalLayout`, `HelpCenterLayout`, `TeamLayout`, `CompaniesLayout`, `CandidateLayout` |
| [`src/components/`](src/components/) | `global/` (nav, footer, search), `landing/`, `fundations/` (head, UI primitives — **keep folder spelling `fundations`**), feature folders (`blog`, `jobs`, `companies`, …) |
| [`src/content/`](src/content/) | Markdown for all collections (see below) |
| [`src/styles/global.css`](src/styles/global.css) | Tailwind entry, `@theme` tokens (fonts, `primary` / `secondary` / `accent`), theme variants `[data-theme="accent"]`, `[data-theme="dark"]` |
| [`src/images/`](src/images/) | Optimized-friendly assets referenced from frontmatter (e.g. flags, company logos); content also references `blog`, `team`, `candidate` paths — add files as needed |
| **`public/`** | **Not present in this repo.** [`Favicons.astro`](src/components/fundations/head/Favicons.astro) still links to root paths like `/favicon.ico`; add a `public/` folder when shipping. |

Schemas and collection loaders are defined in [`src/content.config.ts`](src/content.config.ts).

## Content collections

Slugs in URLs use the **content `id`** (for flat `.md` files this matches the filename stem, e.g. `terms.md` → `terms`).

### `legal` → `src/content/legal/`

- **Required:** `page` (string), `pubDate` (date).
- **Images:** none in schema.
- **Template:** copy from [`src/content/legal/terms.md`](src/content/legal/terms.md).

### `jobs` → `src/content/jobs/`

- **Required:** `title`, `company`, `location`, `type`, `category`, `tags` (string array), `datePosted` (date), `applyUrl`.
- **Optional:** `jobLevel`, `jobType`, `updated`, `salary`, `experienceLevel`, `deadline`, `flag` (`url`: **`image()`**, `alt`), `isFeatured`, `isClosed`.
- **Images:** `flag.url` must satisfy `image()` (repo uses paths such as `/src/images/flags/us.svg`). Optional `logo` is **not** on jobs — only `flag`.
- **Template:** [`src/content/jobs/1.md`](src/content/jobs/1.md).

### `companies` → `src/content/companies/`

- **Required:** `name`, `website`, `description`.
- **Optional:** `founded`, `headquarters`, `hiringPage`, `logo` (**`image()`**), `location`, `size`, `industry`, `benefits`, `companyType`, `remotePolicy`, `culture`, `mission`, `about`, `values`, `milestones`, `socials` (`twitter`, `linkedin`, `github`).
- **Template:** [`src/content/companies/stripe.md`](src/content/companies/stripe.md).

### `candidates` → `src/content/candidates/`

- **Required:** `firstName`, `lastName`, `email` (`z.email()`), `dateApplied` (string in sample entries).
- **Optional:** `phone`, `resumeUrl`, `coverLetter`, `location`, `experienceLevel`, `jobPreferences`, `linkedinProfile`, `githubProfile`, `portfolioUrl`, `status`, `avatar` (`url`: **`image()`**, `alt`), `isFeatured`.
- **Template:** [`src/content/candidates/1.md`](src/content/candidates/1.md).

### `team` → `src/content/team/`

- **Required:** `name`, `image` (`url`: **`image()`**, `alt`).
- **Optional:** `role`, `bio`, `socials` (`twitter`, `website`, `linkedin`, `email`).
- **Template:** [`src/content/team/samuel-ortiz.md`](src/content/team/samuel-ortiz.md).

### `posts` → `src/content/posts/` (`.md` or `.mdx`)

- **Required:** `title`, `pubDate` (date), `description`, **`team`** (string — must match a **`team`** collection entry `id`, e.g. `david-lee` for [`src/content/team/david-lee.md`](src/content/team/david-lee.md)), `image` (`url`: **`image()`**, `alt`), `tags` (string array).
- **Template:** [`src/content/posts/1.md`](src/content/posts/1.md).

### `helpcenter` → `src/content/helpcenter/`

- **Required:** `page` (string), `description` (string).
- **Optional:** `iconId`, `category`, `keywords` (string array), `lastUpdated`, `faq` (array of `{ question, answer }`).
- **Images:** none in schema.
- **Template:** [`src/content/helpcenter/1.md`](src/content/helpcenter/1.md).

## Routing (content → URL)

| Collection | Route pattern | Page(s) |
|------------|---------------|---------|
| `posts` | `/blog/posts/[...slug]` | [`src/pages/blog/posts/[...slug].astro`](src/pages/blog/posts/[...slug].astro) |
| `posts` (tags) | `/blog/tags`, `/blog/tags/[tag]` | [`src/pages/blog/tags/`](src/pages/blog/tags/) |
| `jobs` | `/jobs/[...slug]` | [`src/pages/jobs/[...slug].astro`](src/pages/jobs/[...slug].astro) |
| `jobs` (tags) | `/jobs/tags`, `/jobs/tags/[tag]` | [`src/pages/jobs/tags/`](src/pages/jobs/tags/) |
| `legal` | `/legal/[...slug]` | [`src/pages/legal/[...slug].astro`](src/pages/legal/[...slug].astro) |
| `helpcenter` | `/helpcenter`, `/helpcenter/[...slug]` | [`src/pages/helpcenter/`](src/pages/helpcenter/) |
| `team` | `/team`, `/team/[...slug]` | [`src/pages/team/`](src/pages/team/) |
| `companies` | `/companies/[...slug]` | [`src/pages/companies/[...slug].astro`](src/pages/companies/[...slug].astro) — **no `companies/index.astro` in repo** |
| `candidates` | `/candidates/[...slug]` | [`src/pages/candidates/[...slug].astro`](src/pages/candidates/[...slug].astro) — **no candidates index in repo** |
| RSS | `/rss.xml` | [`src/pages/rss.xml.js`](src/pages/rss.xml.js) — glob targets `./blog/*.{md,mdx}` under `src/pages/blog` (no markdown there); **not wired to the `posts` collection** — adjust if you need feed items. |

**Not in repo:** on-site changelog route; theme changelog is external (see Lexington links below).

## Customization guide

- **Site URL / canonical domain:** set `site` in [`astro.config.mjs`](astro.config.mjs) (default `https://yourdomain.com`). Replace placeholders in [`Seo.astro`](src/components/fundations/head/Seo.astro), [`Meta.astro`](src/components/fundations/head/Meta.astro), and RSS as needed.
- **Brand colors, fonts, Tailwind theme:** [`src/styles/global.css`](src/styles/global.css) — `@theme` (`--font-sans`, `--font-mono`, `--color-primary`, `--color-secondary`, `--color-accent`) and `[data-theme]` overrides.
- **Navigation / footer:** [`src/components/global/Navigation.astro`](src/components/global/Navigation.astro) (`navLinks` array), [`src/components/global/Footer.astro`](src/components/global/Footer.astro).
- **Global chrome:** [`src/layouts/BaseLayout.astro`](src/layouts/BaseLayout.astro) imports `BaseHead`, `Navigation`, `Footer`, theme toggle + scripts. **Head fragment:** [`src/components/fundations/head/BaseHead.astro`](src/components/fundations/head/BaseHead.astro) composes SEO, meta, fonts, favicons, Fuse, and local-storage toggle.

## Commands

From [`README.md`](README.md): `npm install`, `npm run dev`, `npm run build` → `./dist/`, `npm run preview`, `npm run astro ...`, `npm run astro --help`.

## Guardrails

- Do **not** rename [`src/components/fundations/`](src/components/fundations/) — the spelling **`fundations`** is intentional and referenced across the project.
- Do **not** widen [`src/content.config.ts`](src/content.config.ts) schemas without updating every layout/page that reads `entry.data` / `frontmatter`.
- Prefer **minimal diffs** consistent with existing patterns (`@/` imports, collection names `posts` / `jobs`, etc.).
- **`z.email()`** is used for candidate `email` — use valid email-shaped strings in content.

## Lexington Themes (docs & support)

Placeholders match [`README.md`](README.md):

- Theme specs: https://lexingtonthemes.com/templates/carriera  
- Documentation: https://lexingtonthemes.com/documentation  
- Changelog: https://lexingtonthemes.com/changelog/carriera  
- Support: https://lexingtonthemes.com/legal/support/  
- Bundle: https://lexingtonthemes.com  
