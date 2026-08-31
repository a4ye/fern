import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { Toaster } from "sonner";
import { APP_NAME } from "@/lib/site";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
    variable: "--font-be-vietnam-pro",
    subsets: ["latin"],
    weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
    title: {
        default: APP_NAME,
        template: `%s | ${APP_NAME}`,
    },
    description: "Track applications, interviews, and offers.",
};

const RootLayout = ({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) => (
    // Browser extensions (LanguageTool, Grammarly) add attributes to <html>
    // before React hydrates. This suppresses the mismatch one level deep only.
    <html
        lang="en"
        className={`${beVietnamPro.variable} h-full antialiased`}
        suppressHydrationWarning
    >
        <body className="flex min-h-full flex-col">
            {children}
            <Toaster
                position="bottom-right"
                // The type reads from the top edge, the same sage/rose marker
                // the dialogs carry, so the filled default icons can go.
                icons={{ success: null, error: null }}
                toastOptions={{
                    unstyled: true,
                    classNames: {
                        toast: "relative flex w-full items-center gap-3 border-x border-b border-hairline bg-background px-4 py-3 font-sans shadow-sm",
                        content: "min-w-0 flex-1",
                        title: "text-pretty text-xs font-medium text-ink",
                        description: "mt-1 text-xs text-sub",
                        actionButton:
                            "focus-frame inline-flex h-10 shrink-0 cursor-pointer items-center border border-hairline bg-background px-3 text-xs font-medium text-ink transition-colors hover:border-tile-border",
                        success: "border-t-[3px] border-t-accent",
                        info: "border-t-[3px] border-t-accent",
                        warning: "border-t-[3px] border-t-gold",
                        error: "border-t-[3px] border-t-rose",
                    },
                }}
            />
        </body>
    </html>
);
export default RootLayout;
