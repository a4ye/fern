import Link from "next/link";
import { APP_NAME } from "@/lib/site";
import { SLASH_PATH } from "@/components/brand/logo";
import { AgentPanel } from "@/components/landing/agent-panel";
import { AppliedMap } from "@/components/landing/applied-map";
import { CapturePanel } from "@/components/landing/capture-panel";
import { ChangeLog } from "@/components/landing/change-log";
import { HeroMock } from "@/components/landing/hero-mock";
import { ImportMap } from "@/components/landing/import-map";
import { Pipeline } from "@/components/landing/pipeline";
import { Sankey } from "@/components/landing/sankey";
import { SharePanel } from "@/components/landing/share-panel";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { SpreadsheetArt } from "@/components/landing/spreadsheet-art";
import { SystemDiagram } from "@/components/landing/system-diagram";
import { Timeline } from "@/components/landing/timeline";
import { WordFill } from "@/components/landing/word-fill";
import { SwayingFrond } from "@/components/landing/plants/swaying-frond";
import { SwayingVines } from "@/components/landing/plants/swaying-vines";
import { SwayingLeaf } from "@/components/landing/plants/swaying-leaf";
import { SwayingIvy } from "@/components/landing/plants/swaying-ivy";
import { GreenhouseBackdrop } from "@/components/landing/plants/greenhouse-backdrop";
import { TreeRings } from "@/components/landing/plants/tree-rings";
import {
    ginkgoPaths,
    monsteraPaths,
    viewBoxOf,
} from "@/components/landing/plants/plants";

// One plant per chosen section, each a different one, so no two sit close
// together and no section carries more than one. Every piece is fixed to
// something: it grows from a section edge, hangs from one, or grows on one of
// the product panels, and nothing floats loose.
const VINES = [
    { length: 200, leaves: 7, x: 0 },
    { length: 130, leaves: 5, phase: 2, x: 34 },
];
// Below lg the heading starts 64px down and runs the full width, so the vines
// there are short enough to hang in the top padding.
const SHORT_VINES = [
    { length: 56, leaves: 3, leafSize: 24, x: 0 },
    { length: 40, leaves: 2, phase: 2, leafSize: 22, x: 22 },
];
const MONSTERA = { length: 230, stalk: 130, dir: { x: -1, y: -0.1 } };
const MONSTERA_BOX = viewBoxOf(monsteraPaths(MONSTERA).fill, 2);
// The agent panel is 268px tall over 80px of section padding, so the ivy's
// stem starts on the section floor.
const IVY = { rise: 348, run: 240 };
// Below lg the panel's own text fills it edge to edge, so the ivy there only
// reaches in along the top edge from the screen's side, with nothing hanging
// over the panel.
const SHORT_IVY = { rise: 0, run: 150, leafSize: 26, overhang: false };
const RINGS = { radius: 200 };

// A ginkgo leaf slipped under the map's top edge, toward the right, so its
// fan rises into the empty space across from the short heading. The stalk's
// foot sits 40px inside the map, hidden, three quarters of the way across.
const GINKGO = { radius: 100, angle: 14 };
const GINKGO_BOX = viewBoxOf(ginkgoPaths(GINKGO).fill, 4)
    .split(" ")
    .map(Number);
// Below lg it shrinks about that foot and moves further right, so the fan
// stays clear of the paragraph above the map.
const GINKGO_PLACE = {
    left: `calc(var(--leaf-x) + ${GINKGO_BOX[0]}px)`,
    top: 40 + GINKGO_BOX[1],
    width: GINKGO_BOX[2],
    height: GINKGO_BOX[3],
    transformOrigin: `${-GINKGO_BOX[0]}px ${-GINKGO_BOX[1]}px`,
};

// Art sits behind a section's content: the section isolates itself and the
// art takes a negative z-index. Sections clip only top and bottom, so art may
// run past the frame's side borders into the page margins.
const ART = "pointer-events-none absolute -z-10";
// Plants that grow on a panel sit in front of it. Each is drawn twice, first
// in the page colour, so the panel's border does not show through the leaves.
const ON_PANEL = "pointer-events-none absolute z-10";
// The desktop layout puts copy and visuals side by side from lg up; below lg
// they stack, so some pieces have a second, smaller arrangement there.
const WIDE = "hidden lg:block";
const NARROW = "lg:hidden";

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
                <section className="relative isolate overflow-y-clip px-6 pt-16 pb-20 [background:linear-gradient(165deg,var(--color-surface)_0%,var(--color-background)_55%)] sm:px-10 lg:pt-20">
                    {/* Drawn in section pixels at the full desktop width. The
                        frond rises in the gap beside the copy, arches over
                        the mock, and its tip runs past the right border. */}
                    <SwayingFrond
                        viewBox="0 0 1152 552"
                        preserveAspectRatio="xMidYMax slice"
                        placement="translate(492 572)"
                        className={`${ART} ${WIDE} inset-0 h-full w-full overflow-visible`}
                    />
                    <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
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
                            {/* Below lg the hero stacks, so the same arch is
                                drawn against the mock: in the mock's own
                                pixels at its desktop size, 588 by 345, scaled
                                with the mock's width, up to 560px so the
                                pinnae stay below the buttons. */}
                            <SwayingFrond
                                viewBox="0 0 588 345"
                                placement="translate(-32 492)"
                                className={`${ART} ${NARROW} top-0 left-0 aspect-[588/345] w-full overflow-visible sm:max-w-140`}
                            />
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
                <section className="bg-surface px-6 py-16 sm:px-10 lg:py-20">
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
                <section className="relative isolate overflow-y-clip px-6 py-16 sm:px-10 lg:py-20">
                    {/* Two vines hang from the rule above the section. */}
                    <SwayingVines
                        vines={SHORT_VINES}
                        viewBox="-24 0 72 84"
                        className={`${ART} ${NARROW} top-0 right-4 h-21 w-18 overflow-visible`}
                    />
                    <SwayingVines
                        vines={VINES}
                        viewBox="-40 0 120 230"
                        className={`${ART} ${WIDE} top-0 right-32 h-60 w-auto overflow-visible`}
                    />
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
                    {/* A monstera leaf reaching in from the right edge, its
                        midrib drawn in the band's own colour. */}
                    <SwayingLeaf
                        leaf={{ kind: "monstera", options: MONSTERA }}
                        viewBox={MONSTERA_BOX}
                        className="absolute right-0 -bottom-8 h-28 w-auto overflow-visible sm:-bottom-6 sm:h-48 lg:-bottom-10 lg:h-60"
                        fill="fill-accent-deep opacity-60"
                        veins="stroke-ink"
                        veinWidth={2}
                    />
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
                <section className="relative isolate overflow-y-clip bg-surface px-6 py-16 sm:px-10 lg:py-20">
                    <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance">
                        Where you applied.
                    </h2>
                    <p className="mt-4 max-w-md text-sm leading-6 text-sub">
                        Each dot is a city you applied to.
                    </p>
                    <div className="relative mt-12">
                        <SwayingLeaf
                            leaf={{ kind: "ginkgo", options: GINKGO }}
                            viewBox={GINKGO_BOX.join(" ")}
                            style={GINKGO_PLACE}
                            className={`${ART} overflow-visible [--leaf-x:88%] max-lg:scale-55 lg:[--leaf-x:74%]`}
                            fill="fill-accent opacity-25"
                            veins="stroke-background"
                            veinWidth={1}
                            hairlineVeins
                        />
                        <AppliedMap />
                    </div>
                </section>

                <SectionRule number={nextSection()} />
                <section className="relative isolate overflow-y-clip px-6 py-16 sm:px-10 lg:py-20">
                    <h2 className="max-w-xl text-3xl font-semibold tracking-tight text-balance">
                        Nothing you change is lost.
                    </h2>
                    <p className="mt-4 max-w-lg text-sm leading-6 text-sub">
                        Every change is saved to the version history and can be
                        undone. You can also revert a list to any point in its
                        history.
                    </p>
                    {/* Tree rings, a tree's own history, spread out from behind
                        the history panel's top-right corner. The panel is
                        opaque, so only the rings outside it show. */}
                    <div className="relative mt-12">
                        <TreeRings
                            options={RINGS}
                            viewBox="-230 -230 460 460"
                            className={`${ART} top-0 right-0 h-36 w-36 translate-x-1/2 -translate-y-1/2 overflow-visible text-accent/50 lg:h-115 lg:w-115 lg:text-accent/60`}
                        />
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
                <section className="relative isolate overflow-y-clip px-6 py-16 sm:px-10 lg:py-20">
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
                    {/* Ivy climbs the panel's right side from the section floor,
                        turns over its top-right corner, and creeps along the
                        top edge. The panel corner is the ivy's (0, 0). */}
                    <div className="relative mt-12">
                        <SwayingIvy
                            options={SHORT_IVY}
                            viewBox="-172 -44 232 72"
                            className={`${ON_PANEL} ${NARROW} -top-11 -right-15 h-18 w-58 overflow-visible`}
                        />
                        <SwayingIvy
                            options={IVY}
                            viewBox="-280 -48 340 400"
                            className={`${ON_PANEL} ${WIDE} -top-12 -right-15 h-100 w-85 overflow-visible`}
                        />
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
                    <GreenhouseBackdrop />
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
