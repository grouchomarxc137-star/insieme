# Memory optimization

The web server and Discord bot stay online. PDFKit and fonts load only in a
temporary process for each report. One report renders at a time; the process
must exit before its buffer is returned to the existing attachment sender.
The renderer has a 60-second timeout and is terminated during shutdown.

Discord cache limits remain at their library defaults. The bot keeps
`/define`, `/lovevest`, website nickname synchronization, and its connection
to Discord. Discord mood menus, `/clearchannel`, `/triggered`, `/cancel`, and
message lockdown are retired. Website Reset Room sessions and their Discord
summaries continue to work.

Empty realtime presence entries and completed relay queues are released.
Existing database schemas and the production data directory are unchanged.

## Verification

Use Node 22, matching production:

```sh
npm ci
npm test
npm run build
npm run benchmark:memory
```

Tests cover byte-identical PDFs, renderer failures/timeouts/shutdown,
per-key message ordering, cache cleanup, retained commands, nickname recovery,
HTTP persistence, check-in attachments, ticket notifications/archiving, and
two-client Reset Room completion, reconnects, role/session changes, and
cancellation. Discord and dictionary requests are mocked; tests do not send
messages to the real Discord server. Test databases use temporary directories.

The GitHub workflow runs the checks on Linux with Node 22.23.2. On pull
requests it also compares against the base revision and retains the complete
memory measurements as a workflow artifact.

For an independent before/after comparison, provide a checkout of the
original revision with access to the same installed dependencies:

```sh
npm run benchmark:memory -- --baseline-root /path/to/original-checkout
```

The benchmark alternates three original and three optimized processes. Each
loads the full server, renders all four report variants twice, and measures
idle RSS afterward. Integrations are disabled and data is synthetic. On Linux
it also samples the process tree during rendering; summing RSS can count
shared pages twice, so this peak is an estimate rather than a container metric.

Local results on macOS arm64, Node 22.23.2, October 27, 2026:

| Measurement (median of three runs) | Original | Optimized |
| --- | ---: | ---: |
| Startup RSS | 111.8 MiB | 102.0 MiB |
| Idle RSS after eight reports | 142.6 MiB | 103.0 MiB |
| Report rendering time | 12 ms | 84 ms |

That is a 27.8% reduction in warmed idle RSS. PDFKit remains unloaded in the
optimized main process after reports. These measurements exclude an active
Discord gateway session and the npm launcher; production savings must be
confirmed using Railway's container metrics. Rendering temporarily adds a
second process, so peak RAM can exceed the original implementation.

## Railway rollout

`railpack.json` supplies `exec node server/index.js`, avoiding the npm launcher
and replacing the startup shell. Railpack still detects the existing install
and frontend build. Leave any Railway custom start-command override empty,
or set it to the same command. The package engine keeps the Node 22 major.

Keep the existing volume mounted at its current `server/data` location.
`APP_DATA_DIR` is optional for isolated local/staging data; do not change it
for the existing production service. No database migration is required.

The bot now needs only its token, application ID, and guild ID to start.
`DISCORD_CHANNEL_ID` remains the destination for website Reset Room summaries.
`DISCORD_STATUS_CHANNEL_ID` and `PUBLIC_BASE_URL` are no longer used; existing
values can remain without effect. Existing Discord menus are not deleted;
the bot simply stops recreating or handling them.

After deploying the tested revision:

1. Confirm the build's start command is `exec node server/index.js`, the bot
   connects, and only the retained application commands are registered.
2. Confirm the website and existing data load. Use the automated mocked
   checks for write paths; observing production does not require test messages.
3. Compare matching Railway memory windows for 24 hours, including normal
   report usage and its temporary peaks. Do not lower memory limits based only
   on idle readings.
4. Optionally set `MEMORY_DIAGNOSTICS=1` to log process memory totals, active
   PDF jobs, and socket counts once per minute. No content or credentials are
   logged. Unset it after verification.
5. If functionality regresses, redeploy the previous revision. The existing
   database remains compatible; reverting to the original bot will also
   restore its original command/menu initialization.
