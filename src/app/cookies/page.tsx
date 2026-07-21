import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
    title: "Cookie Policy",
};

const Cookies = () => (
    <LegalPage title="Cookie Policy">
        <p>
            Job Tracker uses a small number of cookies to keep you signed in and
            to remember your session. This policy will list each one, its
            purpose, and how long it lasts.
        </p>
        <p>
            The full text is being finalized ahead of launch. Job Tracker does
            not use advertising or third-party tracking cookies.
        </p>
    </LegalPage>
);
export default Cookies;
