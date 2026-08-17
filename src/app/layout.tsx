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
                        toast: "relative w-full border-x border-b border-hairline bg-background px-4 pt-3.5 pb-3 font-sans shadow-sm before:absolute before:inset-x-0 before:top-0 before:h-0.75",
                        title: "text-xs font-medium text-ink",
                        description: "mt-1 text-xs text-sub",
                        success: "before:bg-accent",
                        info: "before:bg-accent",
                        warning: "before:bg-gold",
                        error: "before:bg-rose",
                    },
                }}
            />
        </body>
    </html>
);
export default RootLayout;
