import { Fragment } from "react";
import { CARET_PATH } from "@/components/brand/logo";
import { APP_NAME } from "@/lib/site";

const REQUEST = "Add this posting to Fall 2026, and move Ramp to interviewing.";

const TYPE_START = 0.2;
const TYPE_SPEED = 0.022;

// Every letter is laid out from the start and only uncovered on its turn, so
// the block is its full size before the first one lands and the steps below it
// never move. Words are kept whole, since a line may break between two of them
// but never between two letters.
let typed = 0;
const WORDS = REQUEST.split(" ").map((word) => {
    const offset = typed;
    typed += word.length + 1;
    return { word, offset };
});

const STEPS = [
    { tool: "get_list", result: "Fall 2026, 24 applications" },
    { tool: "add_applications", result: "Stripe, Backend Engineer, added" },
    { tool: "set_status", result: "Ramp moved to Interview" },
];

export const AgentPanel = () => (
    <div aria-hidden="true" className="border border-hairline bg-background">
        <div className="border-b border-hairline bg-surface px-4 py-4">
            <p className="text-xs font-medium text-muted">You</p>
            <p className="mt-2 text-base leading-6 sm:text-lg sm:leading-7">
                {WORDS.map(({ word, offset }, index) => (
                    <Fragment key={offset}>
                        {index > 0 && " "}
                        <span className="inline-block whitespace-nowrap">
                            {[...word].map((letter, position) => (
                                <span
                                    key={position}
                                    style={{
                                        animationDelay: `${TYPE_START + (offset + position) * TYPE_SPEED}s`,
                                    }}
                                    className="ag ag-type opacity-0"
                                >
                                    {letter}
                                </span>
                            ))}
                        </span>
                    </Fragment>
                ))}
            </p>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-faint px-4 py-2.5">
            <span className="text-xs font-medium text-sub">Claude Code</span>
            <span className="flex items-center gap-1.5 border border-hairline bg-surface px-2 py-0.5 text-xs text-sub">
                <svg viewBox="8 10 40 30" className="h-2.5 w-auto">
                    <path d={CARET_PATH} className="fill-accent" />
                </svg>
                {APP_NAME} MCP
            </span>
        </div>

        <div className="flex flex-col gap-4 px-4 py-5">
            {STEPS.map((step, index) => {
                const running = `ag ag-run-${index + 1}`;
                const settled = `ag ag-done-${index + 1}`;
                return (
                    <div
                        key={step.tool}
                        className={`ag ag-step-${index + 1} flex items-center gap-3`}
                    >
                        <span className="grid size-4 shrink-0 place-items-center">
                            <span
                                className={`${running} col-start-1 row-start-1 opacity-0`}
                            >
                                <span className="icon-[lucide--loader-circle] size-3.5 animate-spin text-muted" />
                            </span>
                            <span
                                className={`icon-[lucide--check] ${settled} col-start-1 row-start-1 size-3.5 text-accent`}
                            />
                        </span>

                        <span className="shrink-0 border border-hairline bg-surface px-2 py-0.5 text-xs font-medium text-accent-deep">
                            {step.tool}
                        </span>

                        <span className="grid min-w-0 flex-1 text-sm">
                            <span
                                className={`${running} relative col-start-1 row-start-1 justify-self-start text-muted opacity-0`}
                            >
                                Working
                                <span className="think absolute inset-0 text-accent-deep">
                                    Working
                                </span>
                            </span>
                            <span
                                className={`${settled} col-start-1 row-start-1 truncate text-sub`}
                            >
                                {step.result}
                            </span>
                        </span>
                    </div>
                );
            })}
        </div>
    </div>
);
