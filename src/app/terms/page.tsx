import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
    title: "Terms of Service",
};

const Terms = () => (
    <LegalPage title="Terms of Service">
        <p>
            These terms will cover acceptable use of Job Tracker, the
            responsibilities of both sides, and the limits of the service while
            it is in active development.
        </p>
        <p>
            The full text is being finalized ahead of launch. By using the
            service in the meantime, you accept that it is a work in progress and
            provided without warranty.
        </p>
    </LegalPage>
);
export default Terms;
