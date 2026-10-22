# Blueprint Co-Pilot

Blueprint Co-Pilot is an AI-powered Design Thinking assistant for students. Enter a problem statement and a description of the target user to generate an editable first draft of a Design Thinking blueprint. The app also helps turn assumptions into interview questions, a small validation experiment, an evidence log, and a provisional MVP recommendation.

AI-generated content is a starting point—not validated user research. Students should review the output and use evidence from real users before treating assumptions as validated.

## Project status

This is an early MVP / proof of concept for Design Thinking and Product Lifecycle Management coursework.

### Implemented

- Problem statement and target-user inputs
- Example quick-start prompts
- Server-side AI generation through the Groq API
- Generated persona, including goals and pain points
- Four-part empathy map: Says, Thinks, Does, Feels
- How-Might-We (HMW) statement
- Five-item MVP Bill of Materials (BOM), using Must / Should / Could priorities
- Editable generated fields
- Regeneration of individual blueprint sections
- Loading, error, and retry states
- Copy-summary feature
- Student validation-notes section
- Evidence-to-MVP section with:
  - AI-proposed assumptions, initially marked **Untested**
  - User interview questions
  - A proposed validation experiment
  - An evidence log entered by the student
  - A provisional MVP recommendation and proposed core feature subset
  - An action to apply proposed priorities to the BOM
- Per-assumption status selector: Untested, Testing, and Validated
- Browser-local persistence for Evidence-to-MVP content, assumption statuses, evidence-log entries, and whether the suggested MVP priorities were accepted
- PDF export through the browser's print dialog; export uses the current app state and does not make an additional AI request
- Basic lint, production-build, Evidence-to-MVP integration, and status-logic checks

### Not implemented

- User accounts or authentication
- Cloud database or cross-device blueprint history
- Team collaboration or shared workspaces
- Automatic collection of interview results or other real-world evidence
- Formal testing with student participants

Evidence-to-MVP data is saved in the current browser's local storage. It is not a cloud backup and does not provide account-based or cross-device history.

## Tech stack

- React
- Vite
- JavaScript
- Vercel serverless function for the API endpoint
- Groq API for AI generation
- Browser `localStorage` for Evidence-to-MVP persistence
- Browser print dialog for PDF export

## Project structure

```text
simple-blueprint/
├── api/
│   └── generate.js              # Server-side Groq API endpoint and validation
├── src/
│   ├── App.jsx                  # Main React interface and app styles
│   └── main.jsx                 # React entry point
├── scripts/
│   ├── test-evidence.mjs        # Live Groq integration checks
│   └── test-status.mjs          # Status and persistence logic checks
├── public/                      # Static assets, if any
├── .env.example                 # Safe environment-variable template
├── .gitignore                   # Ignore rules, including local secrets
├── index.html
├── package.json
├── package-lock.json
└── vite.config.js
```

Files may be added or moved as the project evolves; this tree describes the main application files.

## Prerequisites

Install:

1. Node.js (an LTS release is recommended)
2. npm (included with Node.js)
3. Git or GitHub Desktop
4. A Groq API key
5. Vercel CLI for running the API route locally

Check the installation:

```bash
node --version
npm --version
```

## Clone the repository

Repository: <https://github.com/shlokn678/simple-blueprint>

### With Git

```bash
git clone https://github.com/shlokn678/simple-blueprint.git
cd simple-blueprint
```

### With GitHub Desktop

1. Open GitHub Desktop.
2. Choose **File → Clone Repository**.
3. Select `shlokn678/simple-blueprint` (or paste the repository URL).
4. Choose a local folder and clone it.
5. Open the cloned folder in your editor.

## Install dependencies

From the project root:

```bash
npm install
```

This installs the packages from `package.json` and creates `node_modules`. Do not commit `node_modules`; it should remain ignored by Git.

## Configure the Groq API key

Create a file named `.env.local` in the project root—the same folder as `package.json`. Copy the format from `.env.example`, then add your own key:

```text
GROQ_API_KEY=YOUR_GROQ_API_KEY_HERE
```

Replace the placeholder with your actual key. Do not add spaces around `=`. Keep the key on the server side; never put it in React code or expose it through a `VITE_` variable.

### Security rules

- Never commit `.env.local` or a real API key.
- Never hardcode a key in `src/App.jsx`, `api/generate.js`, or any other source file.
- Do not share a key in screenshots, chat messages, or public repositories.
- If a key is exposed, revoke it in the Groq Console and create a replacement.
- `.env.example` should contain placeholders only, never real credentials.

## Run locally

### Frontend only

```bash
npm run dev
```

This starts Vite, usually at <http://localhost:5173>. It is useful for frontend-only work, but it does not by itself provide the Vercel serverless API route at `/api/generate`.

### Frontend plus API

Install the Vercel CLI if needed:

```bash
npm install -g vercel
```

Log in if required:

```bash
vercel login
```

Then, from the project root, run:

```bash
vercel dev
```

Open the local URL printed by the terminal (often <http://localhost:3000>). Use `vercel dev` to test AI generation locally because the app relies on `api/generate.js`.

If you edit `.env.local` while the dev server is running, stop the server with `Ctrl+C` and restart `vercel dev` so the process can reload its environment.

## Test the app manually

Try this example:

```text
Problem / idea:
Students forget to submit assignment feedback forms and lose participation marks.

Target user:
Undergraduate engineering students managing multiple subjects and deadlines.
```

Expected behavior:

1. The generation button displays a loading state.
2. The app generates a persona with goals and pain points.
3. The app generates Says, Thinks, Does, and Feels sections.
4. The app generates a How-Might-We statement.
5. The app generates five MVP features with Must / Should / Could priorities.
6. Fields can be edited, and individual sections can be regenerated.
7. Copy Summary copies the current draft.
8. Evidence-to-MVP can generate assumptions, interview questions, a proposed experiment, and an MVP recommendation.
9. Each assumption status can be changed independently and should remain saved after refresh in the same browser.
10. The student can add evidence-log entries and export the current blueprint using **Export PDF**.

Try a different problem as well, such as bus delays, to check that the generated content responds to the supplied inputs rather than relying on fixed scenario text.

## Tests and quality checks

Run lint:

```bash
npm run lint
```

Run a production build:

```bash
npm run build
```

Run the status-model and persistence logic checks:

```bash
node scripts/test-status.mjs
```

Run the Evidence-to-MVP integration checks:

```bash
node scripts/test-evidence.mjs
```

**Note:** `scripts/test-evidence.mjs` makes live requests to Groq and can consume API tokens. Running it repeatedly or alongside manual generation may hit model rate limits. If Groq responds with a temporary HTTP 429, wait for the indicated reset period before trying again. The status test does not need live AI calls.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GROQ_API_KEY` | Yes | Secret Groq API key read by the server-side API route |

The frontend sends requests to `POST /api/generate`. The server-side function calls Groq and returns structured data to the frontend. The API key must never be returned to the browser.

## Deploy to Vercel

### Initial deployment

1. Push the project to GitHub.
2. Sign in to <https://vercel.com>.
3. Choose **Add New → Project** and import `shlokn678/simple-blueprint`.
4. Allow Vercel to detect the Vite project settings.
5. In the project's environment-variable settings, add:
   - **Name:** `GROQ_API_KEY`
   - **Value:** your actual Groq API key
6. Enable the variable for the environments you intend to use (Production, Preview, and/or Development).
7. Deploy the project.

The local `.env.local` file is not automatically uploaded to Vercel. Configure `GROQ_API_KEY` in the Vercel project settings separately. Redeploy after changing environment variables.

### Deploy from the terminal

For a preview deployment:

```bash
vercel
```

For production:

```bash
vercel --prod
```

## Troubleshooting

### `GROQ_API_KEY is not configured`

- Confirm `.env.local` exists in the project root beside `package.json`.
- Check that the variable is spelled exactly `GROQ_API_KEY` and has no spaces around `=`.
- Confirm the file is named `.env.local`, not `.env.local.txt`.
- Restart `vercel dev` after changing the environment file.
- Confirm `GROQ_API_KEY` is configured in Vercel for deployed environments.

### HTTP 429 / rate limit

Groq can enforce limits such as tokens per minute or requests per minute, separately from longer-period usage limits. Avoid repeatedly clicking Generate or launching several live tests in a short period. Wait for the retry interval indicated by Groq, then try once. A new key in the same organization does not necessarily remove organization-level limits.

### Structured-response or incomplete JSON error

The server validates the response structure before returning it. Retry once after a brief pause if the provider reports a transient response problem. If the issue repeats, inspect the server terminal/logs without exposing the API key or sensitive request payloads.

### `/api/generate` returns 404 locally

You may be running Vite alone:

```bash
npm run dev
```

Stop it with `Ctrl+C` and run:

```bash
vercel dev
```

### Production generation fails but local generation works

Add `GROQ_API_KEY` under **Vercel Dashboard → Project → Settings → Environment Variables**, enable it for the relevant deployment environment, and redeploy.

### Evidence-to-MVP information appears to be missing after refresh

Evidence-to-MVP content, assumption statuses, evidence-log entries, and the accepted-MVP flag are saved in the current browser's local storage. They are not synced to a database or another browser/device. Clearing site data or using a different browser can remove or hide this local state.

## Git workflow

For solo work, you can commit directly to `main` if that matches your workflow. For team contributions, use a separate branch and pull request so changes can be reviewed before merging.

### Recommended team workflow

```bash
git pull origin main
git checkout -b feature/your-task-name
# Make and test changes
git add <files-you-reviewed>
git commit -m "Describe the change"
git push -u origin feature/your-task-name
```

Then open a pull request on GitHub. Do not use `git add .` blindly; inspect `git status` first and keep `.env.local`, secrets, and scratch files out of commits.

## Project principles

- AI output is a first draft, not a substitute for Design Thinking.
- Personas, empathy maps, assumptions, and MVP recommendations remain hypotheses until checked against real-world evidence.
- AI-generated assumptions start as **Untested**. The student changes status as research progresses; the app must not automatically mark AI suggestions as Validated.
- The evidence log represents information recorded by the student, not evidence independently collected or verified by the app.
- The goal is to reduce blank-page friction and keep Design Thinking artifacts consistent while leaving review and validation to the student.
