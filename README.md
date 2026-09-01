# Blueprint Co-Pilot

Blueprint Co-Pilot is an AI-powered Design Thinking assistant for students. A student enters a problem statement and target-user description, and the application generates a structured first draft containing:

- A persona with goals and pain points
- A four-part empathy map: Says, Thinks, Does, Feels
- A How-Might-We (HMW) statement
- A five-item MVP Bill of Materials with Must / Should / Could priorities

The generated result is editable. It is meant to be reviewed and refined by the student, not treated as validated user research.

## Project Status

This is an early MVP/proof of concept for Design Thinking and Product Lifecycle Management coursework.

Implemented:

- Problem and target-user inputs
- Example quick-start inputs
- Gemini AI generation through a Vercel serverless API route
- Persona, empathy map, HMW, and MoSCoW MVP-feature output
- Editable generated fields
- Loading, error, and retry states
- Copy-summary feature
- Student validation-notes section

Not implemented yet:

- User accounts
- Saved blueprint history/database
- Team collaboration
- PDF or Word export
- Formal testing with student participants

## Tech Stack

- React
- Vite
- JavaScript
- Vercel serverless functions
- Google Gemini API

## Folder Structure

```text
blueprint-copilot/
├── api/
│   └── generate.js          # Secure server-side Gemini API endpoint
├── src/
│   ├── App.jsx              # Main React user interface
│   ├── main.jsx             # React entry point
│   └── index.css            # Base Vite styles, if used
├── public/                  # Static files
├── .env.example             # Safe environment-variable template
├── .gitignore               # Prevents secrets/build files from being uploaded
├── index.html
├── package.json
├── package-lock.json
└── vite.config.js
```

## Prerequisites

Each teammate needs the following installed:

1. Node.js (LTS version recommended)
2. npm (installed with Node.js)
3. GitHub Desktop or Git
4. A free Google Gemini API key
5. Vercel CLI for local testing of the API route

Check Node and npm after installation:

```bash
node --version
npm --version
```

## Clone the Repository

### With GitHub Desktop

1. Accept the GitHub repository invitation.
2. Open GitHub Desktop.
3. Click **File → Clone repository**.
4. Select the `blueprint-copilot` repository.
5. Select a local folder and click **Clone**.
6. Click **Open in Visual Studio Code**.

### With Git

```bash
git clone https://github.com/YOUR-ORGANIZATION-OR-USERNAME/blueprint-copilot.git
cd blueprint-copilot
```

Replace the URL above with the actual repository URL.

## Install Dependencies

From the project root folder, run:

```bash
npm install
```

This downloads the packages listed in `package.json` and creates the `node_modules` folder.

Do not upload `node_modules` to GitHub. It is intentionally ignored and recreated with `npm install`.

## Get a Free Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Sign in with a Google account.
3. Click **Create API key**.
4. Create the key in a new or existing Google project.
5. Copy the key.

Treat the key like a password. Do not commit it, share it in public channels, or paste it into frontend code.

## Create Your Local Environment File

In the root project folder, create a file named exactly:

```text
.env.local
```

Do not name it `.env.local.txt`.

Copy the format from `.env.example` and insert your own Gemini key:

```text
GEMINI_API_KEY=PASTE_YOUR_OWN_GEMINI_KEY_HERE
```

There must be no spaces around `=`.

### Security Rules

- `.env.local` is ignored by Git.
- Never add a real key to `App.jsx`, `generate.js`, or any GitHub commit.
- Never send a real API key in a screenshot, chat message, or WhatsApp group.
- If a key is exposed, revoke it in Google AI Studio and create a new one.

## Run Locally

### Frontend Only

```bash
npm run dev
```

This runs the Vite frontend, normally on:

```text
http://localhost:5173
```

It does **not** run the `/api/generate` backend endpoint.

### Frontend and AI Backend

Install Vercel CLI once:

```bash
npm install -g vercel
```

Log in once:

```bash
vercel login
```

Then run this from the project root:

```bash
vercel dev
```

Open the local URL shown in the terminal, normally:

```text
http://localhost:3000
```

Use `vercel dev` when testing live AI generation. It runs both:

- The React/Vite frontend
- The `api/generate.js` serverless function

## Test the App

Use this input to confirm that AI generation works:

```text
Problem / idea:
Students forget to submit assignment feedback forms and lose participation marks.

Target user:
Undergraduate engineering students managing multiple subjects and deadlines.
```

Expected result:

1. The button shows a loading state.
2. The app displays a generated persona.
3. The app displays the four empathy-map sections.
4. The app displays a How-Might-We statement.
5. The app displays five relevant MVP features with Must / Should / Could priorities.
6. The generated fields can be edited.
7. Copy Summary copies the reviewed draft to the clipboard.

Test another unrelated problem, such as a bus-delay problem, to verify that the response is generated from the input rather than fixed scenario data.

## Environment Variables

| Variable | Required? | Description |
|---|---:|---|
| `GEMINI_API_KEY` | Yes | Secret Google Gemini API key used only by `api/generate.js` |

The frontend sends user input to:

```text
POST /api/generate
```

The serverless function sends the prompt to Gemini and returns structured JSON. The API key stays on the server side.

## Deployment to Vercel

### Initial Deployment

1. Push the project to GitHub.
2. Log in to [Vercel](https://vercel.com).
3. Click **Add New → Project**.
4. Import the GitHub repository.
5. Vercel should detect Vite automatically.
6. Add the environment variable in Vercel:

```text
Name: GEMINI_API_KEY
Value: your actual Gemini key
```

Select Production, Preview, and Development if those options are available.

7. Click **Deploy**.

### Deploy from Terminal

Alternatively, run from the project root:

```bash
vercel
```

For a production deployment:

```bash
vercel --prod
```

### Important

Your local `.env.local` does not automatically get uploaded to Vercel. You must add `GEMINI_API_KEY` separately in:

```text
Vercel Dashboard → Project → Settings → Environment Variables
```

After adding or changing an environment variable, redeploy the project.

## Common Problems

### `GEMINI_API_KEY is not configured`

Check all of the following:

- `.env.local` exists in the project root, beside `package.json`.
- The filename is exactly `.env.local`, not `.env.local.txt`.
- The line starts with `GEMINI_API_KEY=`.
- You restarted `vercel dev` after editing the file.
- You are using `vercel dev`, not only `npm run dev`.

### `404 model not found`

Check the model name in `api/generate.js`. Use the model name recommended in the Gemini API error message. Model availability can change over time.

### `Gemini returned an incomplete draft` or JSON error

Click Retry. The API route is designed to reject invalid/incomplete responses rather than show broken UI data. If it happens repeatedly, check the terminal output from `vercel dev`.

### `/api/generate` returns 404 locally

You are probably running only Vite:

```bash
npm run dev
```

Stop it with `Ctrl + C`, then run:

```bash
vercel dev
```

### The production site works but AI generation fails

Add `GEMINI_API_KEY` in the Vercel environment-variable settings, then redeploy.

## Team Git Workflow

Do not have multiple people edit `main` simultaneously.

1. Fetch the newest code before starting:

```bash
git pull origin main
```

2. Create a branch for your task:

```bash
git checkout -b feature/your-task-name
```

Examples:

```text
feature/ui-improvements
feature/prompt-improvement
feature/testing
feature/documentation
```

3. Make and test changes.
4. Commit the changes.
5. Push the branch.
6. Open a pull request to merge it into `main`.

With GitHub Desktop: use **Current Branch → New Branch**, commit your work, click **Publish branch**, then click **Create Pull Request**.

## Project Principles

Blueprint Co-Pilot is not meant to replace Design Thinking or real user research.

- AI output is a **first draft**.
- Personas and empathy maps are **hypotheses** until tested with real students.
- Students should review, edit, and validate the generated content.
- The product focuses on reducing blank-page friction and keeping Design Thinking artifacts consistent.

## Current MVP Scope

The current MVP includes:

- Problem and target-user input
- AI-generated draft persona
- AI-generated draft empathy map
- AI-generated HMW statement
- AI-generated MoSCoW MVP feature list
- Editable output
- Copy summary
- New idea, retry, loading, and error states

Future work includes saved history, PDF/Word export, team collaboration, student testing, and iteration based on validation feedback.
