# Risk Review

## Scope

Public GitHub release of Claude Code Orchestrator, a local CLI for queueing and
resuming Claude Code tasks.

- release_blocker: no

## Security and Abuse Risk

- The repository does not include API keys, Claude sessions, cookies, or local
  queue data.
- The public version does not hardcode Claude Code permission bypass mode.
- The CLI can execute agentic coding tasks in user-selected directories, so users
  must review prompts and run it only in trusted workspaces.
- Runtime data and logs are ignored by Git.

## Structural Risk

- Queue state is stored on the local filesystem.
- Zod schemas validate persisted state.
- The scheduler uses bounded retry/backoff behavior for rate-limit handling.
- Single-process queue processing avoids duplicate concurrent writes.

## API Consumption Risk

- The tool calls the local `claude` CLI. API consumption depends on the user's
  Claude Code configuration and queued prompts.
- Worst-case call amplification is bounded by `maxRetries`.
- Users should set conservative retry limits for expensive tasks.

## Multi-call Amplification Checks

- Queue processing is sequential by default.
- Rate-limit retries wait before resuming.
- No remote fan-out, scraping, or background network polling is included.

## Operational Controls

- `maxRetries` limits retry attempts.
- `stop`, `pause`, and `clear` commands provide manual control.
- Runtime data directories are excluded from Git.
- Dependabot config is included for dependency monitoring.

## Residual Risks

- Medium: queued prompts may contain sensitive project details. Mitigation:
  runtime queue files are ignored by Git. Next action: keep data directories
  private and review prompts before queueing.
- Medium: agentic coding tools can modify files. Mitigation: public defaults do
  not bypass permission checks. Next action: run only in trusted repositories.
