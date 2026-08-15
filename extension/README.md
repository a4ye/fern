# Job Tracker Importer

The extension imports public job postings from the user's browser, then sends
only the parsed company, role, location, arrangement, and pay fields back to Job
Tracker. Normal imports run in the background without opening a tab. The app can
explicitly open a JavaScript-rendered posting when its initial HTML has no job
data; the extension reads that visible page after it renders.

## Build

```bash
bun run extension:build
```

Development builds connect to Job Tracker on `localhost` or `127.0.0.1` on any
port. Reload the unpacked extension after rebuilding it, then refresh the open
Job Tracker tab so the new extension files can connect.

Before building a store release, set the public URL where Job Tracker is
deployed. This is the Job Tracker website, not a job-board URL. The extension
uses this list to know which copies of Job Tracker it can connect to:

```bash
JOB_TRACKER_EXTENSION_APP_ORIGINS="https://example.com/*" bun run extension:build
```

Separate multiple Job Tracker deployments with commas. For example:

```bash
JOB_TRACKER_EXTENSION_APP_ORIGINS="https://jobs.example.com/*,https://preview.example.com/*" bun run extension:build
```

The extension requests access to public HTTP and HTTPS pages so a pasted
posting can work across job sites. Without that permission, importing from a
new domain would require another browser permission prompt for that domain.

The unpacked builds are written to `extension/dist/chrome` and
`extension/dist/firefox`.

## Local installation

- Chrome: open `chrome://extensions`, enable Developer mode, choose **Load
  unpacked**, and select `extension/dist/chrome`.
- Firefox: open `about:debugging#/runtime/this-firefox`, choose **Load Temporary
  Add-on**, and select `extension/dist/firefox/manifest.json`.

Store releases should be built with the production Job Tracker URL and
configured in the web app with `NEXT_PUBLIC_CHROME_EXTENSION_URL` and
`NEXT_PUBLIC_FIREFOX_EXTENSION_URL`.
