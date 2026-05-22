# Setting up Claude Code to build The Well

Claude Code is Anthropic's command-line tool that works inside a project folder on your
Mac. It can read your files, write code, run commands, and build the whole app from the
specs in this folder. This is the right tool to actually build The Well.

## 1. Put this folder where you want it

Move/unzip this `the-well` folder to:

    ~/Documents/Projects/the-well

(or wherever you like — Claude Code works from whatever folder you start it in.)

## 2. Install Claude Code

You need Node.js first. Check if you have it:

    node --version

If that errors or shows a version below 18, install Node from https://nodejs.org
(the LTS version) or via Homebrew: `brew install node`.

Then install Claude Code:

    npm install -g @anthropic-ai/claude-code

Verify:

    claude --version

> If the install details have changed since this was written, the current instructions
> are at https://docs.claude.com — search "Claude Code install".

## 3. Start it in this folder

    cd ~/Documents/Projects/the-well
    claude

The first run will ask you to authenticate (it'll open a browser to log in with your
Anthropic account). After that, Claude Code reads `CLAUDE.md` automatically — so it
already knows the whole project: the stack, the decisions, the brand, the roster, and
where you are in the build.

## 4. First things to ask it

A good opening, now that it has context:

> "Read CLAUDE.md and docs/build-plan.md. We've finished creating the Google OAuth
>  credentials. Scaffold the Next.js 15 app with Auth.js Google sign-in locked to
>  bewellkentucky.com, matching the design in the prototype. Walk me through it step
>  by step."

Or, to plan first:

> "Read CLAUDE.md and the docs. Give me a checklist for getting from zero to a working
>  login on localhost, and tell me exactly what you'll create at each step before you
>  do it."

## 5. As you go

- Keep `CLAUDE.md` updated when decisions change — it's the project's memory.
- Copy `.env.local.template` to `.env.local` and fill in your Google credentials + the
  AUTH_SECRET (run `openssl rand -base64 32` to generate that one).
- The prototype in `prototype/` is the visual + behavioral reference. Point Claude Code
  at it whenever you want the real app to match a specific screen.

## Notes

- Claude Code will ask permission before running commands or editing files the first
  time — you can approve per-action or allow categories. Review what it proposes.
- It works best in small, reviewable steps. "Scaffold the app" then "now add the sign-in
  page" beats "build the whole thing."
- If you'd rather not use the terminal, the same model is available in other Anthropic
  surfaces, but for building a real codebase, Claude Code in the project folder is the
  right tool.
