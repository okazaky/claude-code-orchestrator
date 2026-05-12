# Claude Code Orchestrator

A small TypeScript CLI that queues Claude Code tasks, detects rate-limit events,
and resumes work when the wait window has passed.

This project is not affiliated with Anthropic. It shells out to the locally
installed `claude` CLI and keeps its queue state on the local filesystem.

## Features

- One-shot task runner with retry and rate-limit backoff.
- Persistent task queue with `add`, `list`, `start`, `pause`, `resume`, and
  `clear` commands.
- Inbox folder watcher for adding queued tasks from Markdown or text files.
- Structured state store with Zod validation.
- Unit and integration tests for scheduling, queueing, rate-limit detection,
  state recovery, and orchestration.

## Safety Model

- The public version does not hardcode permission bypass mode.
- Task state is stored locally under `~/.cco/data` by default.
- Runtime data, logs, and build output are ignored by Git.
- No API keys or Claude session data are included in this repository.

## Requirements

- Node.js 20+
- A working `claude` CLI on your `PATH`

## Install

```bash
npm install
npm run build
```

## Usage

Run a single task:

```bash
node dist/index.js run "Refactor this module and run tests" --cwd /path/to/repo
```

Queue a task:

```bash
node dist/index.js add "Fix failing tests" --cwd /path/to/repo
node dist/index.js start
```

Inspect queue state:

```bash
node dist/index.js list
node dist/index.js status
```

## Development

```bash
npm install
npm run build
npm test
npm audit --audit-level=moderate
```

## Architecture

- `src/cli`: command handlers.
- `src/core`: orchestration, scheduling, rate-limit detection, and CLI adapter.
- `src/store`: filesystem-backed state persistence.
- `src/types`: shared interfaces and Zod schemas.
- `tests`: unit and integration coverage.

## Security Notes

Queued prompts can contain sensitive information. Treat the data directory as
private, and do not commit `data/`, `logs/`, or generated output.
