<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Hidden sections

Work that is finished enough to run but not to show stays on `main` behind a
build-time flag in `src/lib/flags.ts`, rather than being reverted or parked on a
branch. The code, its data and its audits keep being maintained with everything
else, and publishing is a one-line change.

`NEXT_PUBLIC_SHOW_UNEXPLAINED` gates the Unexplained Discrepancy Analysis
(`/unexplained`). It defaults to off, so the deployment hides it; to work on it
locally, create a gitignored `.env.local`:

```
NEXT_PUBLIC_SHOW_UNEXPLAINED=1
```

Then restart the dev server, or rebuild — `NEXT_PUBLIC_*` is substituted at
build time, so a hot reload will not pick it up. `NODE_ENV` cannot do this job:
the dashboard is previewed locally with `npm run build && next start`, which is
production mode.

Gate both halves of a flag — the sidebar entry and the route. Hiding only the
nav leaves the page reachable by URL and still prerendered into the deployment.
