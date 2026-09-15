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
    title: "Privacy Policy",
    description: `How ${APP_NAME} collects and uses personal information.`,
};

const sections: LegalSectionLink[] = [
    { id: "about", label: "About this policy" },
    { id: "collection", label: "Information we collect" },
    { id: "use", label: "How we use information" },
    { id: "gmail", label: "Gmail and Google data" },
    { id: "sharing", label: "When information is shared" },
    { id: "retention", label: "Retention and deletion" },
    { id: "rights", label: "Your choices" },
    { id: "security", label: "Security" },
    { id: "changes", label: "Changes and contact" },
];

const Privacy = () => (
    <LegalPage
        title="Privacy Policy"
        summary={`This policy explains what information ${APP_NAME} collects, how it is used, and the choices available to you.`}
        sections={sections}
    >
        <LegalSection id="about" title="1. About this policy">
            <p>
                This Privacy Policy applies to the hosted version of {APP_NAME}.
                It does not apply to a copy of the project hosted by someone
                else or to third-party services that have their own privacy
                policies.
            </p>
        </LegalSection>

        <LegalSection id="collection" title="2. Information we collect">
            <p>We collect the following general categories of information:</p>
            <LegalList>
                <li>
                    <strong className="font-semibold text-ink">
                        Account information.
                    </strong>{" "}
                    When you sign in with GitHub, we receive basic profile
                    information such as your name, email address, profile image,
                    and account identifier.
                </li>
                <li>
                    <strong className="font-semibold text-ink">
                        Information you add.
                    </strong>{" "}
                    This includes job applications, companies, roles, dates,
                    compensation details, notes, status history, and lists.
                </li>
                <li>
                    <strong className="font-semibold text-ink">
                        Gmail information.
                    </strong>{" "}
                    If you choose to connect Gmail, the service reads recent
                    inbox messages to identify possible updates to jobs you are
                    tracking.
                </li>
                <li>
                    <strong className="font-semibold text-ink">
                        Technical information.
                    </strong>{" "}
                    The service receives information normally associated with a
                    web request, such as an IP address, browser information, and
                    session data.
                </li>
                <li>
                    <strong className="font-semibold text-ink">
                        Usage measurements.
                    </strong>{" "}
                    The service records aggregate counts of how its features
                    perform. These counts are not linked to you or to the
                    information in your account.
                </li>
            </LegalList>
        </LegalSection>

        <LegalSection id="use" title="3. How we use information">
            <p>We use information only as reasonably necessary to:</p>
            <LegalList>
                <li>provide and maintain the service;</li>
                <li>authenticate users and protect accounts;</li>
                <li>save and organize job-application information;</li>
                <li>provide optional job-import and Gmail features;</li>
                <li>measure how features perform;</li>
                <li>
                    prevent abuse, investigate problems, and improve the app;
                </li>
                <li>respond to support, privacy, or legal requests; and</li>
                <li>comply with applicable law.</li>
            </LegalList>
            <p>
                We may access the information in your account when that is
                needed to run the service, such as to look into a problem or to
                respond to a request from you. We do not access it for any other
                reason.
            </p>
            <p>
                We do not sell personal information, use it for advertising, or
                share private application records with employers.
            </p>
        </LegalSection>

        <LegalSection id="gmail" title="4. Gmail and Google user data">
            <p>
                Gmail access is optional and read-only. When you ask the service
                to sync your inbox, relevant message content and information
                about your tracked applications are processed by Google&apos;s
                Gemini service to suggest possible status changes. Suggestions
                are shown for your review and are not applied automatically. The
                service does not send, change, or delete your email.
            </p>
            <p>
                The service stores limited details needed to show and manage a
                suggestion. It does not keep a permanent copy of the complete
                email message. Google may process information under its own
                terms and privacy commitments.
            </p>
            <p>
                The use and transfer of information received from Google
                Workspace APIs adheres to the{" "}
                <LegalLink href="https://developers.google.com/terms/api-services-user-data-policy">
                    Google API Services User Data Policy
                </LegalLink>
                , including its Limited Use requirements. Google user data is
                used only to provide the inbox-sync feature. It is not sold,
                used for advertising, or used by {APP_NAME} to train artificial
                intelligence models.
            </p>
        </LegalSection>

        <LegalSection id="sharing" title="5. When information is shared">
            <p>
                Information may be processed by services needed to operate the
                app, including GitHub for sign-in, Google for optional Gmail and
                AI features, hosting and database providers, and public job
                sites when you ask to import a posting. These providers process
                information under their own terms or on behalf of the service.
            </p>
            <p>
                Information may also be disclosed where required by law or
                reasonably necessary to protect the service, its users, or the
                rights and safety of others. We do not disclose personal
                information to data brokers or advertisers.
            </p>
        </LegalSection>

        <LegalSection id="retention" title="6. Retention and deletion">
            <p>
                Account and application information is generally kept while you
                use the service. You can delete individual applications and
                lists from the dashboard. Related records are deleted with them.
            </p>
            <p>
                You can delete your account at any time from the settings page.
                Doing so permanently removes your account and the information
                saved in it, including your lists and applications. This cannot
                be undone. You may also request deletion instead.
            </p>
            <p>
                After a deletion, some limited information may remain
                temporarily in backups, security records, or where retention is
                required by law. Information is not kept longer than reasonably
                necessary for those purposes.
            </p>
            <p>
                Aggregate usage measurements contain no personal information and
                are retained indefinitely.
            </p>
        </LegalSection>

        <LegalSection id="rights" title="7. Your choices and rights">
            <p>
                You may choose not to connect Gmail, and you may revoke access
                through your Google Account at any time. You may delete your
                account yourself from the settings page. You may also ask to
                access, correct, export, or delete personal information
                associated with your account. We may need to verify that you
                control the account before completing a request.
            </p>
        </LegalSection>

        <LegalSection id="security" title="8. Security">
            <p>
                We use reasonable technical and organizational safeguards to
                protect personal information. However, no online service can
                guarantee absolute security.
            </p>
        </LegalSection>

        <LegalSection id="changes" title="9. Changes and contact">
            <p>
                This policy may be updated as the service changes. The date at
                the top of this page will identify the latest version. Material
                changes will receive additional notice where appropriate.
            </p>
            <p>
                Questions or privacy requests can be submitted through{" "}
                <LegalContact />.
            </p>
        </LegalSection>
    </LegalPage>
);
export default Privacy;
