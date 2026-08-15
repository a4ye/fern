"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { IDetectedBarcode, IScannerError } from "@yudiel/react-qr-scanner";
import {
    cameraErrorMessage,
    scannedJobLink,
} from "@/components/dashboard/qr-link";

const SCANNER_ID = "job-link-qr-scanner";

const Scanner = dynamic(
    () => import("@yudiel/react-qr-scanner").then((module) => module.Scanner),
    {
        ssr: false,
        loading: () => (
            <div
                role="status"
                className="flex size-full items-center justify-center gap-2 text-sm text-background"
            >
                <span
                    aria-hidden="true"
                    className="icon-[lucide--loader-circle] size-4 animate-spin"
                />
                Starting camera…
            </div>
        ),
    },
);

type ScannerState = "closed" | "scanning" | "error";

export const QrLinkScanner = ({
    disabled = false,
    onScan,
}: {
    disabled?: boolean;
    onScan: (url: string) => void;
}) => {
    const [state, setState] = useState<ScannerState>("closed");
    const [message, setMessage] = useState<string | null>(null);
    const active = useRef(false);
    const accepted = useRef(false);

    const start = () => {
        active.current = true;
        accepted.current = false;
        setMessage(null);
        setState("scanning");
    };

    const close = () => {
        active.current = false;
        setMessage(null);
        setState("closed");
    };

    const readCodes = (codes: IDetectedBarcode[]) => {
        if (!active.current || accepted.current) return;

        for (const code of codes) {
            const result = scannedJobLink(code.rawValue);
            if (!result.ok) continue;

            accepted.current = true;
            active.current = false;
            setMessage(null);
            setState("closed");
            onScan(result.value);
            return;
        }

        setMessage("That QR code is not a job posting link. Try another code.");
    };

    const cameraFailed = (error: IScannerError) => {
        if (!active.current) return;
        active.current = false;
        setMessage(cameraErrorMessage(error));
        setState("error");
    };

    return (
        <>
            <button
                type="button"
                onClick={state === "scanning" ? close : start}
                disabled={disabled && state !== "scanning"}
                aria-expanded={state !== "closed"}
                aria-controls={state !== "closed" ? SCANNER_ID : undefined}
                className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 border border-hairline bg-background px-3 text-sm font-medium text-ink transition-[background-color,color,scale] hover:bg-surface active:scale-[0.96] disabled:cursor-not-allowed disabled:text-muted disabled:opacity-60"
            >
                <span
                    aria-hidden="true"
                    className={`${state === "scanning" ? "icon-[lucide--x]" : "icon-[lucide--scan-line]"} size-4`}
                />
                {state === "scanning"
                    ? "Close"
                    : state === "error"
                      ? "Try again"
                      : "Scan QR"}
            </button>

            {state === "scanning" ? (
                <div
                    id={SCANNER_ID}
                    className="relative col-span-2 aspect-[4/3] min-h-56 overflow-hidden bg-ink shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)] sm:aspect-video"
                >
                    <Scanner
                        onScan={readCodes}
                        onError={cameraFailed}
                        formats={["qr_code"]}
                        constraints={{
                            facingMode: { ideal: "environment" },
                            width: { ideal: 1280 },
                            height: { ideal: 720 },
                        }}
                        components={{
                            finder: false,
                            onOff: false,
                            torch: false,
                            zoom: false,
                        }}
                        styles={{
                            container: { width: "100%", height: "100%" },
                            video: {
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                            },
                        }}
                        allowMultiple={false}
                        sound={false}
                    >
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <span className="size-40 border-2 border-background/90 shadow-sm" />
                        </div>
                        <div className="pointer-events-none absolute inset-x-3 bottom-3 bg-ink/75 px-3 py-2 text-center text-xs font-medium text-background">
                            <span aria-live="polite">
                                {message ??
                                    "Point the camera at the job posting QR code."}
                            </span>
                        </div>
                    </Scanner>
                </div>
            ) : state === "error" && message ? (
                <div
                    id={SCANNER_ID}
                    role="alert"
                    className="col-span-2 flex items-start gap-3 border border-hairline bg-background p-3"
                >
                    <span
                        aria-hidden="true"
                        className="flex size-10 shrink-0 items-center justify-center bg-surface text-sub"
                    >
                        <span className="icon-[lucide--camera-off] size-4" />
                    </span>
                    <p className="min-w-0 flex-1 pt-2 text-sm text-sub">
                        {message}
                    </p>
                    <button
                        type="button"
                        onClick={close}
                        aria-label="Dismiss camera error"
                        className="flex size-10 shrink-0 cursor-pointer items-center justify-center text-muted transition-[background-color,color,scale] hover:bg-surface hover:text-ink active:scale-[0.96]"
                    >
                        <span
                            aria-hidden="true"
                            className="icon-[lucide--x] size-4"
                        />
                    </button>
                </div>
            ) : null}
        </>
    );
};
