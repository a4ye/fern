import type { Metadata } from "next";
import {
    LegalContact,
    LegalLink,
    LegalList,
    LegalPage,
    LegalSection,
    type LegalSectionLink,
} from "@/components/legal/legal-page";
import { APP_NAME } from "@/lib/site";

export const metadata: Metadata = {
    title: "Terms of Service",
    description: `Terms governing use of the hosted ${APP_NAME} service.`,
};

const sections: LegalSectionLink[] = [
    { id: "acceptance", label: "Acceptance" },
    { id: "service", label: "The service" },
    { id: "accounts", label: "Accounts" },
    { id: "content", label: "Your content" },
    { id: "acceptable-use", label: "Acceptable use" },
    { id: "third-parties", label: "Third-party features" },
    { id: "availability", label: "Availability and changes" },
    { id: "disclaimers", label: "Disclaimers" },
    { id: "liability", label: "Liability" },
    { id: "termination", label: "Termination and general terms" },
];

const Terms = () => (
    <LegalPage
        title="Terms of Service"
        summary={`These Terms govern your use of the hosted ${APP_NAME} service.`}
        sections={sections}
    >
        <LegalSection id="acceptance" title="1. Acceptance of these Terms">
            <p>
                By accessing or using {APP_NAME}, you agree to these Terms of
                Service and acknowledge the{" "}
                <LegalLink href="/privacy">Privacy Policy</LegalLink>. If you do
                not agree, you must not use the service.
            </p>
        </LegalSection>

        <LegalSection id="service" title="2. The service">
            <p>
                {APP_NAME} is a tool for organizing job applications, importing
                information from job postings, and optionally reviewing status
                suggestions based on a connected Gmail inbox.
            </p>
        </LegalSection>

        <LegalSection id="accounts" title="3. Accounts">
            <p>
                You sign in through GitHub. You are responsible for maintaining
                the security of your GitHub account and devices and for activity
                that occurs through your account.
            </p>
            <p>
                You may not share, sell, or transfer access to your account or
                use another person&apos;s account without permission.
            </p>
        </LegalSection>

        <LegalSection id="content" title="4. Your content">
            <p>
                You retain ownership of information you add to the service. You
                grant {APP_NAME} limited permission to host, process, and
                display that information only as needed to operate, secure, and
                support the service.
            </p>
            <p>
                You are responsible for the content you provide and must have
                the right to use it. Do not submit unlawful material,
                confidential employer information, or another person&apos;s
                personal information without authorization.
            </p>
        </LegalSection>

        <LegalSection id="acceptable-use" title="5. Acceptable use">
            <p>You must not:</p>
            <LegalList>
                <li>use the service for an unlawful or fraudulent purpose;</li>
                <li>access accounts, inboxes, or data without permission;</li>
                <li>
                    send spam, flood the service with requests, attempt a
                    denial-of-service attack, or bypass rate limits;
                </li>
                <li>
                    interfere with the service, bypass its security, or
                    introduce malicious code;
                </li>
                <li>violate the rights or terms of a third-party service.</li>
            </LegalList>
        </LegalSection>

        <LegalSection id="third-parties" title="6. Third-party features">
            <p>
                The service works with third parties such as GitHub, Google, and
                public job sites. Your use of those services is governed by
                their own terms and policies. We are not responsible for
                third-party services, content, availability, or changes.
            </p>
            <p>
                Gmail and artificial intelligence features are optional. Their
                suggestions may be inaccurate or incomplete and are provided for
                convenience only. They are not statements from an employer and
                do not constitute career, legal, financial, or employment
                advice.
            </p>
        </LegalSection>

        <LegalSection id="availability" title="7. Availability and changes">
            <p>
                We may modify, suspend, or discontinue any part of the service
                at any time. We may also update these Terms. The updated date
                will appear at the top of this page, and material changes will
                receive additional notice where appropriate.
            </p>
        </LegalSection>

        <LegalSection id="disclaimers" title="8. Disclaimers">
            <p className="font-medium text-ink">
                To the fullest extent permitted by law, the service is provided
                “as is” and “as available,” without warranties of any kind,
                whether express, implied, or statutory.
            </p>
            <p>
                We do not warrant that the service will be uninterrupted,
                secure, or error-free, that data will never be lost, or that
                imported or generated information will be accurate. Nothing in
                these Terms limits a warranty or consumer right that cannot
                lawfully be excluded.
            </p>
        </LegalSection>

        <LegalSection id="liability" title="9. Limitation of liability">
            <p>
                To the fullest extent permitted by law, {APP_NAME} will not be
                liable for indirect, incidental, special, consequential, or
                punitive damages, or for lost data, opportunities, profits, or
                goodwill arising from your use of the service.
            </p>
            <p>
                Nothing in these Terms excludes or limits liability where doing
                so would be unlawful. Some jurisdictions do not allow certain
                limitations, so part of this section may not apply to you.
            </p>
        </LegalSection>

        <LegalSection
            id="termination"
            title="10. Termination and general terms"
        >
            <p>
                You may stop using the service at any time. We may suspend or
                terminate access where reasonably necessary to address a breach
                of these Terms, abuse, security risk, legal requirement, or the
                discontinuation of the project.
            </p>
            <p>
                If any provision of these Terms is unenforceable, the remaining
                provisions will continue in effect. A failure to enforce a
                provision is not a waiver of it. These Terms and the Privacy
                Policy form the entire agreement concerning the hosted service.
            </p>
            <p>
                Questions about these Terms can be submitted through{" "}
                <LegalContact />.
            </p>
        </LegalSection>
    </LegalPage>
);
export default Terms;
