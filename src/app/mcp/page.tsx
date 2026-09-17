import type { Metadata } from "next";
import { headers } from "next/headers";
import { APP_NAME } from "@/lib/site";
import { CopyAddress } from "@/components/mcp/copy-address";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";

export const metadata: Metadata = {
    title: "MCP server",
    description: `Let an AI agent read and update your ${APP_NAME} account.`,
};

const BENEFITS = [
    "Ask an agent to add the jobs you found today",
    "Move a batch of applications in one sentence",
    "You can undo its actions in a list's version history",
];

const STEPS = [
    "Copy the address above into your agent as a remote MCP server.",
    `The agent opens ${APP_NAME} in your browser and asks you to sign in.`,
    "Approve the connection once.",
];

// Codex registers the server and signs in to it as two steps, so both are given
// as one line to paste. Claude Code does the same work in a single command.
const terminalCommands = (
    address: string,
): { label: string; command: string }[] => [
    {
        label: "Claude Code",
        command: `claude mcp add --transport http fern ${address}`,
    },
    {
        label: "Codex",
        command: `codex mcp add fern --url ${address} && codex mcp login fern`,
    },
];

const Mcp = async () => {
    // The address is whatever host this page was served from, so the copy box is
    // right on a preview deployment and in development without either being
    // configured. A client connecting to the wrong origin is sent through the
    // sign-in of the other one, which is confusing in exactly the place where a
    // person cannot see what went wrong.
    const requestHeaders = await headers();
    const host = requestHeaders.get("host") ?? "localhost:3000";
    const protocol = host.startsWith("localhost") ? "http" : "https";
    const address = `${protocol}://${host}/api/mcp`;

    return (
        <main className="flex flex-1 flex-col">
            <SiteHeader framed={false} />

            <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-14">
                <h1 className="text-3xl font-semibold tracking-tight">
                    MCP server
                </h1>
                <p className="mt-4 text-base leading-7 text-sub">
                    Connect an AI agent to your account and it can keep your
                    applications up to date for you.
                </p>

                <ul className="mt-6 space-y-2">
                    {BENEFITS.map((benefit) => (
                        <li
                            key={benefit}
                            className="flex items-center gap-2.5 text-sm text-sub"
                        >
                            <span
                                aria-hidden="true"
                                className="icon-[lucide--check] size-4 shrink-0 text-accent"
                            />
                            {benefit}
                        </li>
                    ))}
                </ul>

                <section className="mt-10 border-t border-hairline pt-8">
                    <h2 className="text-base font-semibold">Server address</h2>
                    <div className="mt-4">
                        <CopyAddress address={address} />
                    </div>
                </section>

                <section className="mt-10 border-t border-hairline pt-8">
                    <h2 className="text-base font-semibold">Connect</h2>
                    <ol className="mt-4 space-y-4">
                        {STEPS.map((step, index) => (
                            <li
                                key={step}
                                className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3"
                            >
                                <span className="text-sm text-muted tabular-nums">
                                    {index + 1}.
                                </span>
                                <p className="min-w-0 text-sm leading-6">
                                    {step}
                                </p>
                            </li>
                        ))}
                    </ol>

                    <p className="mt-6 text-sm leading-6 text-muted">
                        From a terminal, this is one line.
                    </p>
                    <div className="mt-4 space-y-4">
                        {terminalCommands(address).map(({ label, command }) => (
                            <div key={label}>
                                <p className="text-xs font-medium text-sub">
                                    {label}
                                </p>
                                <CopyAddress address={command} />
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            <SiteFooter />
        </main>
    );
};
export default Mcp;
