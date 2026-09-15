import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import Script from "next/script";
import { APP_NAME } from "@/lib/site";
import "./globals.css";

const UMAMI_WEBSITE_ID = "6a9ac013-be45-4553-9eef-24306af4c24b";

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
            {process.env.NODE_ENV === "production" && (
                <>
                    <Script
                        src="https://umami.aaronye.dev/script.js"
                        strategy="lazyOnload"
                        data-website-id={UMAMI_WEBSITE_ID}
                    />
                    <Script
                        src="https://umami.aaronye.dev/recorder.js"
                        strategy="lazyOnload"
                        data-website-id={UMAMI_WEBSITE_ID}
                    />
                </>
            )}
        </body>
    </html>
);
export default RootLayout;
