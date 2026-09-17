import Link from "next/link";
import { APP_NAME } from "@/lib/site";
import { CARET_PATH, SLASH_PATH } from "@/components/brand/logo";
import { AgentPanel } from "@/components/landing/agent-panel";
import { AppliedMap } from "@/components/landing/applied-map";
import { CapturePanel } from "@/components/landing/capture-panel";
import { ChangeLog } from "@/components/landing/change-log";
import { HeroMock } from "@/components/landing/hero-mock";
import { ImportMap } from "@/components/landing/import-map";
import { ParallaxLayer } from "@/components/landing/parallax-layer";
import { Pipeline } from "@/components/landing/pipeline";
import { Sankey } from "@/components/landing/sankey";
import { SharePanel } from "@/components/landing/share-panel";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { SpreadsheetArt } from "@/components/landing/spreadsheet-art";
import { SystemDiagram } from "@/components/landing/system-diagram";
import { Timeline } from "@/components/landing/timeline";
import { WordFill } from "@/components/landing/word-fill";

// Email sync access is temporarily limited, so its promotional content stays
// off the public landing page until the wider rollout resumes.
const EMAIL_SYNC_PROMOTION_ENABLED: boolean = false;

const LINK_IMPORT_STEPS = [
    {
        numeral: "01",
        title: "Paste a link",
        body: "Company, role, salary, and dates fill themselves from the posting URL.",
    },
    {
        numeral: "02",
        title: "Review the details",
        body: "Check what was found, then add any notes or details that matter to you.",
    },
    {
        numeral: "03",
        title: "Track your search",
        body: "Keep every stage, date, salary, and note together as your search moves forward.",
    },
];

const EMAIL_SYNC_STEPS = [
    {
        numeral: "01",
        title: "Paste a link",
        body: "Company, role, salary, and dates fill themselves from the posting URL.",
    },
    {
        numeral: "02",
        title: "Connect your inbox",
        body: "Replies, invites, and offers move each application to the right stage.",
    },
    {
        numeral: "03",
        title: "Watch it stay current",
        body: "Stages, salaries, and timelines stay accurate without a single cell edited.",
    },
];

const STEPS = EMAIL_SYNC_PROMOTION_ENABLED
    ? EMAIL_SYNC_STEPS
    : LINK_IMPORT_STEPS;

const STANDARD_FINE_PRINT = [
    {
        title: "Built for the search",
        body: "Keep roles, stages, salary, dates, and notes together in one focused record.",
    },
    {
        title: "Open source",
        body: "The full source is public. Review it, contribute, or run your own instance.",
    },
    {
        title: "Yours to keep",
        body: "Export the whole record anytime. Your job-search data never gets trapped.",
    },
];

const EMAIL_SYNC_FINE_PRINT = [
    {
        title: "Read only",
        body: `${APP_NAME} reads your recruiting mail. It never sends, moves, or deletes anything.`,
    },
    {
        title: "Open source",
        body: "The full source is public. Review it, contribute, or run your own instance.",
    },
    {
        title: "Yours to keep",
        body: "Export the whole record anytime, and disconnect your inbox in one click.",
    },
];

const FINE_PRINT = EMAIL_SYNC_PROMOTION_ENABLED
    ? EMAIL_SYNC_FINE_PRINT
    : STANDARD_FINE_PRINT;

const SectionRule = ({ number, id }: { number: string; id?: string }) => (
    <div
        id={id}
        className="scroll-mt-20 border-y border-hairline px-6 py-3 sm:px-10"
    >
        <span className="text-xs font-medium text-accent-deep">{number}</span>
    </div>
);

const Home = () => {
    let sections = 0;
    const nextSection = () => String(++sections).padStart(2, "0");

    return (
        <main className="flex flex-1 flex-col overflow-x-clip">
            <SiteHeader />

            <div className="mx-auto w-full max-w-6xl flex-1 border-x border-hairline">
                <section className="px-6 pt-16 pb-20 [background:linear-gradient(165deg,var(--color-accent-tint-soft)_0%,var(--color-background)_55%)] sm:px-10 lg:pt-20">
                    <div className="grid items-center gap-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
                        <div>
                            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                                A job tracker that fills itself in.
                            </h1>
                            <p className="mt-5 max-w-md text-base leading-7 text-sub">
                                {EMAIL_SYNC_PROMOTION_ENABLED ? (
                                    <>
                                        Paste a link. Connect your inbox. The
                                        tracking happens on its own.
                                    </>
                                ) : (
                                    <>
                                        Paste a posting link. Keep every
                                        application organized in one place.
                                    </>
                                )}
                            </p>
                            <div className="mt-8 flex items-center gap-6">
                                <Link
                                    href="/dashboard"
                                    className="inline-flex h-10 items-center bg-accent px-5 text-sm font-medium text-background transition-colors hover:bg-accent-deep"
                                >
                                    Start tracking
                                </Link>
                                <a
                                    href="#how"
                                    className="text-sm font-medium text-accent-deep underline decoration-hairline underline-offset-4 transition-colors hover:decoration-accent"
                                >
                                    See how it works
                                </a>
                            </div>
                        </div>
                        <div className="relative">
                            <ParallaxLayer
                                strength={6}
                                className="pointer-events-none absolute inset-0"
                            >
                                <div
                                    aria-hidden="true"
                                    className="absolute -inset-x-10 -top-12 -bottom-8 [background-image:radial-gradient(var(--color-tile-border)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:radial-gradient(ellipse_60%_60%_at_center,black,transparent)]"
                                />
                                <svg
                                    aria-hidden="true"
                                    viewBox="8 10 40 30"
                                    className="absolute -top-13 right-8 h-40 w-auto"
                                >
                                    <path
                                        d={CARET_PATH}
                                        className="fill-accent-tint-soft"
                                    />
                                </svg>
                            </ParallaxLayer>
                            <div
                                aria-hidden="true"
                                className="absolute inset-0 translate-x-3 translate-y-3 border border-hairline bg-accent-tint/40"
                            />
                            <HeroMock
                                emailSyncPromotionEnabled={
                                    EMAIL_SYNC_PROMOTION_ENABLED
                                }
                            />
                        </div>
                    </div>
                </section>

                <SectionRule number={nextSection()} />
                <section className="px-6 py-16 [background:radial-gradient(55%_65%_at_88%_0%,var(--color-rose-tint),transparent)] sm:px-10 lg:py-20">
                    <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance">
                        The sheet only knows what you remember to tell it.
                    </h2>
                    <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
                        <div className="max-w-md text-sm leading-6 text-sub">
                            <p>
                                You type every field by hand. Updates pile up
                                and the status is already stale. A formula
                                breaks, a sort scrambles, an application you
                                forget to log.
                            </p>
                            <p className="mt-4">
                                A few weeks in, the sheet is always a step
                                behind.
                            </p>
                        </div>
                        <SpreadsheetArt />
                    </div>
                </section>

                <SectionRule number={nextSection()} id="how" />
                <section className="bg-accent-tint-soft px-6 py-16 sm:px-10 lg:py-20">
                    <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance">
                        {EMAIL_SYNC_PROMOTION_ENABLED ? (
                            <>
                                It reads the posting and your inbox,{" "}
                                <span className="text-accent-deep">
                                    so you don&apos;t.
                                </span>
                            </>
                        ) : (
                            <>
                                It reads the posting,{" "}
                                <span className="text-accent-deep">
                                    so you don&apos;t have to.
                                </span>
                            </>
                        )}
                    </h2>
                    <p className="mt-4 max-w-md text-sm leading-6 text-sub">
                        {EMAIL_SYNC_PROMOTION_ENABLED
                            ? "The link fills in the details. Your inbox keeps the stage current."
                            : "Paste the link and the tracker fills in the company, role, salary, and dates."}
                    </p>
                    <div className="mt-12">
                        <SystemDiagram
                            emailSyncPromotionEnabled={
                                EMAIL_SYNC_PROMOTION_ENABLED
                            }
                        />
                    </div>
                    <div className="mt-14 grid gap-10 border-t border-hairline pt-10 sm:grid-cols-3">
                        {STEPS.map((step) => (
                            <div key={step.numeral}>
                                <span className="text-xs font-medium text-accent-deep">
                                    {step.numeral}
                                </span>
                                <h3 className="mt-2 text-base font-medium">
                                    {step.title}
                                </h3>
                                <p className="mt-1.5 text-sm leading-6 text-sub">
                                    {step.body}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                <SectionRule number={nextSection()} />
                <section className="bg-surface px-6 py-16 sm:px-10 lg:py-20">
                    <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance">
                        Three ways to add a posting.
                    </h2>
                    <p className="mt-4 max-w-lg text-sm leading-6 text-sub">
                        The extension covers the sites a plain link cannot
                        reach. The scanner reads a QR code directly, with no
                        link to copy first.
                    </p>
                    <div className="mt-12">
                        <CapturePanel />
                    </div>
                </section>

                <SectionRule number={nextSection()} />
                <section className="px-6 py-16 sm:px-10 lg:py-20">
                    <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance">
                        Bring the old spreadsheet with you.
                    </h2>
                    <p className="mt-4 max-w-lg text-sm leading-6 text-sub">
                        Drop in a CSV or an Excel file. {APP_NAME} reads your
                        headers and matches them to fields.
                    </p>
                    <div className="mt-12">
                        <ImportMap />
                    </div>
                </section>

                <div className="relative overflow-hidden border-t border-hairline bg-ink px-6 py-24 sm:px-10 lg:py-32">
                    <svg
                        aria-hidden="true"
                        viewBox="8 10 40 30"
                        className="absolute -top-8 -right-6 h-56 w-auto"
                    >
                        <path d={CARET_PATH} className="fill-accent-deep/25" />
                    </svg>
                    <WordFill
                        text="Forty applications. Six interviews. One offer. The details won't fit in your head, so the tracker holds them."
                        className="relative max-w-4xl text-3xl leading-snug font-semibold tracking-tight sm:text-4xl lg:text-5xl"
                        activeClass="text-background"
                        inactiveClass="text-background/25"
                    />
                </div>

                <SectionRule number={nextSection()} />
                <section className="px-6 py-16 sm:px-10 lg:py-20">
                    <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance">
                        One season, start to offer.
                    </h2>
                    <p className="mt-4 max-w-md text-sm leading-6 text-sub">
                        Dozens of applications. A handful of interviews. One
                        offer that ends it.
                    </p>
                    <div className="mt-12">
                        <Pipeline />
                    </div>
                </section>

                {EMAIL_SYNC_PROMOTION_ENABLED && (
                    <>
                        <SectionRule number={nextSection()} />
                        <section className="relative overflow-hidden bg-surface px-6 py-16 sm:px-10 lg:py-20">
                            <svg
                                aria-hidden="true"
                                viewBox="56 10 24 30"
                                className="absolute top-10 -right-10 h-72 w-auto sm:right-4"
                            >
                                <path
                                    d={SLASH_PATH}
                                    className="fill-accent-tint-soft"
                                />
                            </svg>
                            <div className="relative">
                                <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance">
                                    One application, start to finish.
                                </h2>
                                <div className="mt-12 max-w-2xl">
                                    <Timeline />
                                </div>
                                <p className="mt-12 max-w-md text-base font-medium text-ink">
                                    You did the interviews. The tracker kept the
                                    record.
                                </p>
                            </div>
                        </section>
                    </>
                )}

                <SectionRule number={nextSection()} />
                <section className="px-6 py-16 sm:px-10 lg:py-20">
                    <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance">
                        The chart you never had to make.
                    </h2>
                    <p className="mt-4 max-w-md text-sm leading-6 text-sub">
                        Applied, interviewed, answered or not. The whole season
                        in one drawing you never touched.
                    </p>
                    <div className="mt-12">
                        <Sankey />
                    </div>
                </section>

                <SectionRule number={nextSection()} />
                <section className="bg-accent-tint-soft px-6 py-16 sm:px-10 lg:py-20">
                    <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance">
                        Where you applied.
                    </h2>
                    <p className="mt-4 max-w-md text-sm leading-6 text-sub">
                        Each dot is a city you applied to.
                    </p>
                    <div className="mt-12">
                        <AppliedMap />
                    </div>
                </section>

                <SectionRule number={nextSection()} />
                <section className="px-6 py-16 sm:px-10 lg:py-20">
                    <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance">
                        Nothing you change is lost.
                    </h2>
                    <p className="mt-4 max-w-lg text-sm leading-6 text-sub">
                        Every change is saved to the version history and can be
                        undone. You can also revert a list to any point in its
                        history.
                    </p>
                    <div className="mt-12">
                        <ChangeLog />
                    </div>
                </section>

                <SectionRule number={nextSection()} />
                <section className="bg-surface px-6 py-16 sm:px-10 lg:py-20">
                    <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance">
                        Share a list.
                    </h2>
                    <p className="mt-4 max-w-lg text-sm leading-6 text-sub">
                        Share it with a friend, or make a link that you can set
                        to expire.
                    </p>
                    <div className="mt-12">
                        <SharePanel />
                    </div>
                </section>

                <SectionRule number={nextSection()} />
                <section className="px-6 py-16 sm:px-10 lg:py-20">
                    <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance">
                        Let an agent do the work.
                    </h2>
                    <p className="mt-4 max-w-lg text-sm leading-6 text-sub">
                        Your agent can use the {APP_NAME} MCP server to view and
                        edit your lists and applications for you.
                    </p>
                    <Link
                        href="/mcp"
                        className="mt-6 inline-flex text-sm font-medium text-accent-deep underline decoration-hairline underline-offset-4 transition-colors hover:decoration-accent"
                    >
                        How to connect
                    </Link>
                    <div className="mt-12">
                        <AgentPanel />
                    </div>
                </section>

                <SectionRule number={nextSection()} />
                <section className="bg-surface px-6 py-16 sm:px-10">
                    <div className="grid gap-10 sm:grid-cols-3">
                        {FINE_PRINT.map((item) => (
                            <div key={item.title}>
                                <h3 className="text-base font-medium">
                                    {item.title}
                                </h3>
                                <p className="mt-1.5 max-w-xs text-sm leading-6 text-sub">
                                    {item.body}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="relative overflow-hidden border-t border-hairline bg-ink">
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 [background:radial-gradient(70%_90%_at_50%_100%,var(--color-accent-deep),transparent)] opacity-30"
                    />
                    <svg
                        aria-hidden="true"
                        viewBox="8 10 40 30"
                        className="absolute -bottom-10 -left-12 h-64 w-auto"
                    >
                        <path d={CARET_PATH} className="fill-accent-deep/40" />
                    </svg>
                    <svg
                        aria-hidden="true"
                        viewBox="56 10 24 30"
                        className="absolute -top-12 -right-8 h-64 w-auto"
                    >
                        <path d={SLASH_PATH} className="fill-gold/30" />
                    </svg>
                    <div className="relative px-6 py-24 text-center lg:py-32">
                        <h2 className="text-4xl font-semibold tracking-tight text-balance text-background sm:text-5xl">
                            Retire the spreadsheet.
                        </h2>
                        <p className="mt-4 text-sm text-background/60">
                            Sign in with GitHub and paste your first posting
                            link.
                        </p>
                        <div className="mt-9">
                            <Link
                                href="/dashboard"
                                className="inline-flex h-10 items-center bg-background px-5 text-sm font-medium text-ink transition-colors hover:bg-accent-tint"
                            >
                                Start tracking
                            </Link>
                        </div>
                    </div>
                </section>
            </div>

            <SiteFooter
                emailSyncPromotionEnabled={EMAIL_SYNC_PROMOTION_ENABLED}
            />
        </main>
    );
};
export default Home;
