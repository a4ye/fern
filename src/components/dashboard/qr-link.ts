import type { IScannerError } from "@yudiel/react-qr-scanner";
import { URL_MAX } from "@/lib/constraints";

const INVALID_LINK_MESSAGE =
    "That QR code does not contain a valid job posting link.";

export type ScannedJobLink =
    { ok: true; value: string } | { ok: false; error: string };

export const scannedJobLink = (raw: string): ScannedJobLink => {
    const value = raw.trim();
    if (!value || value.length > URL_MAX) {
        return { ok: false, error: INVALID_LINK_MESSAGE };
    }

    try {
        const { protocol } = new URL(value);
        if (protocol === "http:" || protocol === "https:") {
            return { ok: true, value };
        }
    } catch {
        // The shared message below covers malformed and non-link QR content.
    }

    return { ok: false, error: INVALID_LINK_MESSAGE };
};

export const cameraErrorMessage = (error: IScannerError): string => {
    switch (error.kind) {
        case "permission-denied":
        case "security":
            return "Camera access was blocked. Allow it in your browser settings and try again.";
        case "no-camera":
            return "No camera was found on this device.";
        case "in-use":
        case "aborted":
            return "The camera is busy in another app. Close it there and try again.";
        case "overconstrained":
            return "The rear camera could not be opened. Try again or paste the link.";
        case "insecure-context":
            return "Camera scanning needs a secure HTTPS connection.";
        case "unsupported":
            return "This browser does not support camera scanning.";
        default:
            return "Could not start the camera. Check its permissions and try again.";
    }
};
