"use client";

import { useSyncExternalStore } from "react";
import type { ExtensionBrowser } from "@/lib/site";

const subscribe = () => () => {};
const serverBrowser = (): ExtensionBrowser => "chrome";
const browserBrowser = (): ExtensionBrowser =>
    navigator.userAgent.includes("Firefox") ? "firefox" : "chrome";

// Static extension pages default to the Chrome-compatible package, then tailor
// the controls after hydration when the browser can be identified locally.
export const useExtensionBrowser = (): ExtensionBrowser =>
    useSyncExternalStore(subscribe, browserBrowser, serverBrowser);
