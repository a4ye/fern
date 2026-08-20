import type { Metadata } from "next";
import {
    LegalContact,
    LegalLink,
    LegalPage,
    LegalSection,
    type LegalSectionLink,
} from "@/components/legal/legal-page";
import { APP_NAME } from "@/lib/site";

export const metadata: Metadata = {
    title: "Cookie Policy",
    description: `How ${APP_NAME} uses cookies.`,
};

const sections: LegalSectionLink[] = [
    { id: "about", label: "About cookies" },
    { id: "use", label: "Cookies we use" },
    { id: "third-parties", label: "Third-party cookies" },
    { id: "changes", label: "Changes and contact" },
];

const Cookies = () => (
    <LegalPage
        title="Cookie Policy"
        summary={`${APP_NAME} uses only the cookies needed to sign users in and operate the service.`}
        sections={sections}
    >
        <LegalSection id="about" title="1. About cookies">
            <p>
                Cookies are small pieces of information stored by your browser.
                This policy explains how the hosted {APP_NAME} service uses
                them. For more information about personal data, see the{" "}
                <LegalLink href="/privacy">Privacy Policy</LegalLink>.
            </p>
        </LegalSection>

        <LegalSection id="use" title="2. Cookies we use">
            <p>
                {APP_NAME} uses essential session cookies to keep users signed
                in and protect their accounts.
            </p>
            <p>
                The current service does not use advertising, analytics, or
                cross-site tracking cookies.
            </p>
            <p>
                The service records aggregate usage measurements without
                cookies, as described in the{" "}
                <LegalLink href="/privacy">Privacy Policy</LegalLink>.
            </p>
        </LegalSection>

        <LegalSection id="third-parties" title="3. Third-party cookies">
            <p>
                When you sign in through GitHub or choose to connect Gmail,
                those providers may use cookies on their own websites for
                sign-in, security, preferences, and other purposes described in
                their policies. Those cookies are controlled by GitHub or
                Google, not by {APP_NAME}.
            </p>
        </LegalSection>

        <LegalSection id="changes" title="4. Changes and contact">
            <p>
                This policy may be updated if cookie practices change. Questions
                can be submitted through <LegalContact />.
            </p>
        </LegalSection>
    </LegalPage>
);
export default Cookies;
