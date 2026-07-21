import type { Metadata } from "next";
import { APP_NAME } from "@/lib/site";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
    title: "Privacy Policy",
};

const Privacy = () => (
    <LegalPage title="Privacy Policy">
        <p>
            {APP_NAME} connects to your email and job postings to keep your
            application record current. This policy will explain exactly what
            data is read, how it is stored, how long it is kept, and how you can
            export or delete it at any time.
        </p>
        <p>
            The full text is being finalized ahead of launch. Until then, the
            source is public, so you can review how data is handled directly in
            the code.
        </p>
    </LegalPage>
);
export default Privacy;
