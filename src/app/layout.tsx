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
    <html lang="en" className={`${beVietnamPro.variable} h-full antialiased`}>
        <body className="flex min-h-full flex-col">
            {children}
            <Toaster
                position="bottom-right"
                toastOptions={{
                    style: {
                        borderRadius: 0,
                        border: "1px solid var(--color-hairline)",
                        background: "var(--color-background)",
                        color: "var(--color-ink)",
                    },
                }}
            />
        </body>
    </html>
);
export default RootLayout;
