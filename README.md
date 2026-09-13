# Vylos IDE

**The IDE that teaches you to code.**

Vylos is an AI-powered desktop IDE for learning programming by doing. Instead of watching videos and copying code, you learn inside a real editor — guided by a voice tutor that sees your code, structured courses that go module by module, and AI help that gives you hints before answers.

Built with Next.js + Electron, powered by Google Gemini.

---

## Features

### 🎓 Vylos Academia — structured learning paths

A built-in course catalog with **36 curated, Mosh-style curricula** — each one sequenced module by module, topic by topic, from fundamentals to a capstone project:

- **16 languages** — Python, JavaScript, TypeScript, Java, C++, C, Kotlin, Swift, Go, HTML & CSS, Rust, C#, Ruby, PHP, SQL, PostgreSQL
- **20 frameworks & platforms** — React, Next.js, Vue, Angular, Svelte, Node.js & Express, Django, Flask, FastAPI, Spring Boot, Android (Jetpack Compose), iOS (SwiftUI), ASP.NET Core, Unity, Ruby on Rails, Laravel, Gin (Go), Axum (Rust), Qt (C++), Tailwind CSS

Each course is 9–14 modules with detailed lesson topics (~80–130 lessons per course). Progress is tracked per lesson with module and course progress bars, persists across restarts, and multiple courses can be in progress at once. The catalog is searchable (searching "python" also finds Django/Flask/FastAPI).

Don't see your goal? **Custom Path** lets the AI architect a personalized roadmap for anything.

### 🎙️ Voice Tutor — a teacher inside your editor

A real-time voice tutor (Gemini Live) that talks with you and works in your editor like a teacher at your side:

- **Teaches hands-on**: opens and creates files, types code into your editor in small explained steps, highlights the lines it's talking about, saves and **runs code in the integrated terminal** so you learn from real output and real errors
- **Teaches the curriculum**: click the mic on any lesson (or "Learn with Voice Tutor" on a course) and it teaches exactly that topic with a strict **teach → practice → quiz** loop — it only marks a lesson complete after you pass its quiz, then moves to the next lesson systematically
- **Resumable**: stop any time; a **Continue Lesson** button in the tutor panel picks up exactly where you left off (even after restarting the app), with the previous conversation as context
- **Yours**: 8 voices to choose from, live captions, and a full transcript sidebar of everything said and done
- Toggle any time with **Ctrl+L**

### 💡 AI code understanding

- **Hover explanations**: functions and classes get a subtle dotted underline — hover one and the AI explains in plain English what that block does, its inputs/outputs, and common mistakes. Cached, so repeat hovers are instant.
- **Step-by-step problem solving**: write your problem as a comment (`// how do I reverse a linked list?` or `# problem: ...`) and a clickable lens appears offering graded help — **Hint 1 → Hint 2 → Algorithm idea → Pseudocode → Implementation (optional)** — one step per click, inserted as comments below your question. You learn to solve it; you don't just copy it.
- **AI chat**: a chat panel for questions about your learning path and code.

### 🛠️ A real IDE

- **Monaco editor** (the engine behind VS Code) with the Vylos dark theme, multiple tabs, autosave, and format-on-demand
- **File explorer** like VS Code: file-type icons, folders first, a right-click menu (new file/folder, rename, cut/copy/paste, copy path, reveal in file manager, open in terminal, delete to Trash), drag and drop to move, and quick open (**Ctrl+P**)
- **Picks up where you left off**: reopens your last folder and tabs, with recently opened files and folders under **File → Open Recent**
- **Integrated terminal** — run your code without leaving the app
- **Workspace search** and a **Git view**
- **Settings**: font size, minimap, line numbers, word wrap, autosave
- Custom title bar, status bar, and a keyboard-first workflow

### 🔐 Accounts & onboarding

Sign in / sign up happens in your system browser (Supabase auth — email or OAuth); no credentials are typed into the app. A short onboarding flow gets you from install to your first lesson.

---

## Getting started

### Prerequisites

- Node.js 18+
- A **Supabase project** (free tier is fine) for sign-in and the AI backend
- A **Gemini API key** ([aistudio.google.com](https://aistudio.google.com/app/apikey)), stored as a Supabase secret — see [AI backend](#ai-backend-supabase-edge-functions)

### Setup

```bash
git clone <repo-url>
cd vylos-ide
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...         # auth + AI backend
NEXT_PUBLIC_SUPABASE_ANON_KEY=...    # auth + AI backend
```

In the Supabase dashboard, add `http://localhost:51735/` to **Auth → URL Configuration → Redirect URLs** (the desktop app's browser sign-in flow uses it).

### AI backend (Supabase Edge Functions)

The Gemini API key never ships in the app. Signed-in users reach Gemini through two Edge Functions in `supabase/functions/`: `ai-generate` for text features and `ai-live-token`, which hands the voice tutor a single-use token. Each user gets a daily request limit, tracked in the `ai_usage` table.

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>   # from https://<ref>.supabase.co
npx supabase db push                                 # creates ai_usage + consume_ai_quota
npx supabase secrets set GEMINI_API_KEY=...
npx supabase functions deploy
```

Optional secrets (set the same way; no redeploy needed):

| Secret | Default | Meaning |
|---|---|---|
| `AI_DAILY_TEXT_LIMIT` | `200` | Text requests per user per day (UTC) |
| `AI_DAILY_VOICE_LIMIT` | `20` | Voice sessions per user per day (UTC) |
| `AI_MAX_OUTPUT_TOKENS` | `8192` | Cap per text answer, thinking included |
| `AI_TEXT_MODEL` | `gemini-3.6-flash` | Gemini model for text features |

### Run

```bash
# Full desktop app (Next.js dev server + Electron shell)
npm run electron:dev

# Web-only (UI development in a browser)
npm run dev
```

### Build

```bash
npm run electron:build   # packaged desktop app (electron-builder)
npm run build            # Next.js static export only
```

### Release

Installed apps update from **GitHub Releases**, not from pushed commits. To ship a version users receive (bump the version, `npm run release`, publish the draft), follow **[docs/RELEASING.md](docs/RELEASING.md)**. It also covers what to check when the update screen doesn't appear.

Only packages the Electron main process loads at runtime belong in `dependencies` — they are the ones copied into the installer. Everything the UI uses goes in `devDependencies`, since Next.js compiles it into `out/`. Putting a UI package in `dependencies` bloats the installer; putting a main-process package in `devDependencies` breaks the packaged app.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+L` | Toggle the voice tutor |
| `Ctrl+P` | Quick open file |
| `Ctrl+S` / `Ctrl+Shift+S` | Save / Save as |
| `Ctrl+N` / `Ctrl+O` | New file / Open file |
| `Ctrl+K Ctrl+O` | Open folder |
| `` Ctrl+` `` | Toggle terminal |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+Shift+E` / `Ctrl+Shift+F` | Explorer / Search |

---

## Command line

Open folders and files from a terminal, like `code .` or `cursor .`:

```bash
vylos .              # open the current folder
vylos ~/projects/app # open a folder
vylos main.py        # open a file (a new file is created on first save)
vylos --help
```

The terminal prompt comes straight back. If Vylos is already open, the path opens in the running window.

- **.deb** — the package installs `vylos` automatically.
- **AppImage / Windows** — run **Terminal › Install 'vylos' Command in PATH** once. On Linux it goes in `~/.local/bin`, and it keeps working after the AppImage updates itself. The AppImage also offers to install it the first time it opens.

---

## Project structure

```
app/
  components/            UI: editor, side panel, terminal, title bar…
    learning/            Course catalog, course view, AI roadmap
    voice/               Voice orb + tutor transcript panel
  lib/
    ai/                  Gemini integration
      gemini-live.ts       realtime voice session (WebSocket)
      tutor-tools.ts       tutor tools (write code, run commands, quizzes…)
      code-hover.ts        hover explanations
      step-guide.ts        step-by-step problem solving (CodeLens)
      roadmap-generator.ts custom AI learning paths
    learning/
      curricula/           all 36 course definitions (one file each)
      types.ts             course/module/lesson model + progress math
      lesson-utils.ts      lesson navigation for the tutor
    stores/              Zustand stores (courses, voice, files, auth…)
electron/
  main.ts                desktop shell: fs, terminal, window, auth server
  preload.ts             IPC bridge (window.electron)
  auth-page.html         browser sign-in page
```

## Tech stack

- **App**: Next.js 16 (App Router, static export) + React 19 + TypeScript
- **Desktop**: Electron (`electron-serve`), IPC for filesystem, terminal, and window controls
- **Editor**: Monaco Editor
- **AI**: Google Gemini — `gemini-2.5-flash` for text features, Gemini Live native audio for the voice tutor
- **State**: Zustand (persisted stores)
- **Auth**: Supabase (browser-based flow)
- **Styling**: Tailwind CSS 4 + custom Vylos theme

## Notes

- AI features require an internet connection and a Gemini API key; the editor, terminal, and course catalog work offline.
- Course progress, tutor lesson position, chat transcript, and settings persist locally on your machine.
