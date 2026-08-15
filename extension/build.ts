import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const extensionRoot = resolve(import.meta.dir);
const outputRoot = resolve(extensionRoot, "dist");
const sourceRoot = resolve(extensionRoot, "src");
const defaultOrigins = ["http://localhost/*", "http://127.0.0.1/*"];

const configuredOrigins = process.env.JOB_TRACKER_EXTENSION_APP_ORIGINS?.split(
    ",",
)
    .map((origin) => origin.trim())
    .filter(Boolean);
const appOrigins =
    configuredOrigins && configuredOrigins.length > 0
        ? configuredOrigins
        : defaultOrigins;

const baseManifest = {
    manifest_version: 3,
    name: "Job Tracker Importer",
    description:
        "Save job postings faster and fill details from more job sites.",
    version: "0.1.0",
    permissions: ["scripting", "tabs"],
    // Seamless arbitrary-URL imports require up-front access. The extension
    // never sends raw page HTML to Job Tracker; only parsed application fields.
    host_permissions: ["http://*/*", "https://*/*"],
    content_scripts: [
        {
            matches: appOrigins,
            js: ["app-bridge.js"],
            run_at: "document_start",
        },
    ],
    icons: {
        "48": "icon.png",
        "128": "icon.png",
    },
    action: { default_title: "Job Tracker Importer" },
};

const manifests = {
    chrome: {
        ...baseManifest,
        background: { service_worker: "background.js" },
    },
    firefox: {
        ...baseManifest,
        background: { scripts: ["background.js"] },
        browser_specific_settings: {
            gecko: {
                id: "job-tracker-importer@job-tracker.app",
                strict_min_version: "128.0",
            },
        },
    },
};

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const build = await Bun.build({
    entrypoints: [
        resolve(sourceRoot, "background.ts"),
        resolve(sourceRoot, "app-bridge.ts"),
        resolve(sourceRoot, "posting-reader.ts"),
    ],
    outdir: resolve(outputRoot, "bundles"),
    target: "browser",
    format: "iife",
    minify: true,
    sourcemap: "external",
});

if (!build.success) {
    for (const log of build.logs) process.stderr.write(`${log}\n`);
    process.exit(1);
}

for (const [browser, manifest] of Object.entries(manifests)) {
    const browserRoot = resolve(outputRoot, browser);
    await mkdir(browserRoot, { recursive: true });
    for (const name of ["background", "app-bridge", "posting-reader"]) {
        await Bun.write(
            resolve(browserRoot, `${name}.js`),
            Bun.file(resolve(outputRoot, "bundles", `${name}.js`)),
        );
        await Bun.write(
            resolve(browserRoot, `${name}.js.map`),
            Bun.file(resolve(outputRoot, "bundles", `${name}.js.map`)),
        );
    }
    await Bun.write(
        resolve(browserRoot, "manifest.json"),
        `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await Bun.write(
        resolve(browserRoot, "icon.png"),
        Bun.file(resolve(extensionRoot, "../public/logo-square.png")),
    );
}

await rm(resolve(outputRoot, "bundles"), { recursive: true, force: true });
process.stdout.write(
    `Built Chrome and Firefox extensions for ${appOrigins.join(", ")}\n`,
);
