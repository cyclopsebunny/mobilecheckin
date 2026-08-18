# Deploying the DockPass prototype

Gets you an HTTPS URL you can share with colleagues, gated behind one shared
access code.

## Why the gate exists

Every BOL/CDL scan calls OpenAI with `OPENAI_API_KEY`. A public URL with no gate
means anyone holding the link can spend against that key. Setting
`SITE_PASSWORD` puts every page **and every API route** behind a shared code.

`src/middleware.ts` is inert when `SITE_PASSWORD` is unset, so local development
is unaffected.

> This is a shared password, not authentication — no per-user identity, no audit
> trail. Fine for an internal demo; replace with SSO before it touches anything
> sensitive.

## 1. Environment variables

Set these on the host. Never commit them — `.gitignore` already excludes
`.env*.local`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `SITE_PASSWORD` | **yes, for a shared deploy** | Shared access code. Omit and the app is wide open. |
| `OPENAI_API_KEY` | yes | BOL + CDL extraction. Billable per scan. |
| `OPENAI_MODEL` | no | Defaults to `gpt-4o`. `gpt-4o-mini` is cheaper but invents field values. |
| `FMCSA_WEBKEY` | no | Carrier verification. Free key at <https://mobile.fmcsa.dot.gov/>. Without it the carrier badge stays unverified. |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | no | Keyed map embed on the result screen; falls back to a keyless embed. |

## 2. Deploy to Vercel (recommended)

Next.js needs no extra config on Vercel — `next.config.ts` is already
deploy-clean.

**Via the dashboard** (gives a persistent URL plus auto-deploys on push):

1. <https://vercel.com/new> → import `cyclopsebunny/mobilecheckin`.
2. Framework preset is detected as Next.js. Leave build settings alone.
3. Add every variable from the table above under **Environment Variables**.
4. Deploy. You get `https://<project>.vercel.app`.

**Via the CLI** instead:

```bash
npx vercel login && npx vercel --prod
```

Add the env vars first, one per variable:

```bash
npx vercel env add SITE_PASSWORD production
```

## 3. Share it

Send colleagues the URL plus the access code — separately, not in the same
message. First load shows the unlock screen; the cookie then lasts 30 days.

To rotate the code, change `SITE_PASSWORD` on the host and redeploy. Existing
cookies stop validating immediately.

## Notes

- **The camera needs HTTPS.** `getUserMedia` is blocked on plain HTTP. Vercel
  serves HTTPS, so scanning works on a deployed URL; it will not work if you
  expose the dev server over http on the LAN.
- **Vercel's own Deployment Protection** can restrict access to your Vercel team
  as an additional layer. Availability varies by plan; the in-app gate works on
  any plan, including Hobby.
- **Cost.** Each BOL scan is one `gpt-4o` vision call, each CDL another. Set a
  spend limit on the OpenAI key before sharing the link widely.
- **Account ownership.** The repo currently lives under a personal GitHub
  account. Hosting company work with live API keys there is worth a deliberate
  decision — moving the repo to a Chamberlain org first may be preferable.

## Quick local check of the gate

```bash
npm run build && SITE_PASSWORD=test npx next start -p 4321
```

`GET /` should 307 to `/unlock`, and `POST /api/extract-document` should return
401 until you submit the code.
