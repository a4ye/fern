"use client";

import { useState } from "react";
import { completeOnboarding } from "@/app/dashboard/settings-actions";
import { useModalDialog } from "@/components/dashboard/use-modal-dialog";
import { useViewing } from "@/components/dashboard/viewing";
import { APP_NAME } from "@/lib/site";

const BUTTON_CLASS =
    "inline-flex h-10 cursor-pointer items-center gap-2 px-4 text-sm font-medium transition-[background-color,color,scale] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const STEPS = [
    {
        label: "Lists",
        title: "Start with a list",
        body: "A list groups applications together, like Summer 2027 internships or New Grad 2027.",
        image: "/onboarding/lists.webp",
        narrow: "/onboarding/lists-narrow.webp",
        alt: "The lists page with four lists, each showing how many applications it holds.",
    },
    {
        label: "Add",
        title: "Add a job by pasting its link",
        body: `${APP_NAME} tries to fetch the job details for you, so you do not have to type them in. Install the extension to cover more sites and fetch more. You can also import a spreadsheet you already have.`,
        image: "/onboarding/add.webp",
        narrow: "/onboarding/add-narrow.webp",
        alt: "The new application panel, open to a field for pasting a job posting link.",
    },
    {
        label: "Track",
        title: "See where applications end up",
        body: "A Sankey and other stats are generated automatically from your application statuses and their history.",
        image: "/onboarding/insights.webp",
        narrow: "/onboarding/insights-narrow.webp",
        alt: "A Sankey chart tracing applications from applied through to interviews, offers, and rejections.",
    },
];

const Stepper = ({ at }: { at: number }) => (
    <ol className="flex items-center gap-2">
        {STEPS.map((step, index) => (
            <li key={step.label} className="flex items-center gap-2">
                {index > 0 && (
                    <span
                        aria-hidden="true"
                        className="icon-[lucide--chevron-right] size-3 text-muted"
                    />
                )}
                <span
                    aria-current={index === at ? "step" : undefined}
                    className={
                        index === at
                            ? "text-xs font-medium text-ink"
                            : "text-xs text-muted"
                    }
                >
                    {step.label}
                </span>
            </li>
        ))}
    </ol>
);

const WelcomeDialog = ({ onClose }: { onClose: () => void }) => {
    const { ref: dialogRef, close } = useModalDialog();
    const viewing = useViewing();
    const [at, setAt] = useState(0);

    // Reaching the end and skipping are the same outcome, so both record the
    // welcome as seen. The result is not awaited: see completeOnboarding.
    const dismiss = () => {
        if (!viewing) void completeOnboarding();
        close(onClose);
    };

    const step = STEPS[at];
    const last = at === STEPS.length - 1;

    return (
        <dialog
            ref={dialogRef}
            aria-labelledby="welcome-dialog-title"
            onCancel={(event) => {
                event.preventDefault();
                dismiss();
            }}
            onClick={(event) => {
                if (event.target === dialogRef.current) dismiss();
            }}
            // The height cap earns its keep on short windows: without it the
            // footer falls past the bottom edge and Skip and Next cannot be
            // clicked at all.
            className="m-auto max-h-[calc(100dvh-2rem)] w-256 max-w-[calc(100vw-2rem)] overflow-y-auto border-0 bg-background p-0 shadow-lg backdrop:bg-ink/25"
        >
            <div className="h-0.75 bg-accent" aria-hidden="true" />
            {/* Takes the dialog's opening focus so that it lands on the
                content being announced rather than ringing the Next button.

                No side borders anywhere in here: a hairline running down the
                edge of a screenshot reads as a stray beige line drawn on the
                image rather than as the frame of the dialog. The shadow and the
                accent bar carry the edge instead. */}
            <div autoFocus tabIndex={-1} className="outline-none">
                {/* Two shots per step, because a desktop capture shrunk to a
                    phone's width is an unreadable smear. The narrow one is the
                    app's own mobile layout, taken just under the sm breakpoint
                    so it still has the pixels to stay sharp. picture lets the
                    browser fetch only the one it will show.

                    Every step is rendered so that moving between them never
                    waits on a fetch, and the image sets the height rather than
                    an aspect box, which would leave a sliver of the parent
                    showing under it. */}
                <div className="border-b border-hairline">
                    {STEPS.map((entry, index) => (
                        <picture
                            key={entry.label}
                            className={index === at ? "block" : "hidden"}
                        >
                            <source
                                media="(min-width: 640px)"
                                srcSet={entry.image}
                                width={1440}
                                height={520}
                            />
                            <img
                                src={entry.narrow}
                                alt={entry.alt}
                                width={639}
                                height={460}
                                className="block h-auto w-full"
                            />
                        </picture>
                    ))}
                </div>

                {/* Tall enough for the longest step, so moving between them
                    does not resize the dialog under the pointer. */}
                <div className="min-h-44 px-5 py-5 sm:min-h-34">
                    <h2
                        id="welcome-dialog-title"
                        className="text-balance text-base font-semibold text-ink"
                    >
                        {step.title}
                    </h2>
                    <p className="mt-1.5 max-w-prose text-pretty text-sm leading-5 text-sub">
                        {step.body}
                    </p>
                </div>

                {/* Back is always drawn and the primary button holds a width,
                    so no control moves out from under the pointer between
                    steps. Skip is spelled out rather than left to a corner
                    cross, which is the one thing a welcome has to make easy. */}
                <div className="flex flex-col items-stretch gap-3 border-t border-faint px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <Stepper at={at} />
                    <div className="flex items-center justify-end gap-1">
                        <button
                            type="button"
                            onClick={dismiss}
                            className={`${BUTTON_CLASS} text-muted hover:bg-surface hover:text-ink`}
                        >
                            Skip
                        </button>
                        <button
                            type="button"
                            onClick={() => setAt(at - 1)}
                            disabled={at === 0}
                            className={`${BUTTON_CLASS} text-sub hover:bg-surface hover:text-ink disabled:pointer-events-none disabled:opacity-30`}
                        >
                            Back
                        </button>
                        <button
                            type="button"
                            onClick={() => (last ? dismiss() : setAt(at + 1))}
                            className={`${BUTTON_CLASS} justify-center bg-accent text-background hover:bg-accent-deep sm:min-w-40`}
                        >
                            {last ? `Start using ${APP_NAME}` : "Next"}
                        </button>
                    </div>
                </div>
            </div>
        </dialog>
    );
};

// Opens itself on a first visit, and stays reachable afterwards from the
// button. Bottom left because toasts occupy the opposite corner.
export const Welcome = ({ due }: { due: boolean }) => {
    // Dismissing records the welcome as seen for whoever the page belongs to,
    // which an admin viewing the account cannot do and should not do on their
    // behalf. So it never opens itself at them; the button still reaches it.
    const viewing = useViewing();
    const [open, setOpen] = useState(due && !viewing);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                title="Show the welcome"
                aria-label="Show the welcome"
                className="focus-frame fixed bottom-4 left-4 z-30 flex size-8 cursor-pointer items-center justify-center rounded-full border border-hairline bg-background text-xs font-medium text-sub shadow-sm transition-colors hover:border-tile-border hover:text-ink sm:bottom-6 sm:left-6 sm:size-9 sm:text-sm"
            >
                ?
            </button>
            {open && <WelcomeDialog onClose={() => setOpen(false)} />}
        </>
    );
};
