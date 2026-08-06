import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import {
    STATUS_META,
    type ApplicationStatus,
} from "@/components/dashboard/data";
import type { NormalizedEmail } from "./types";

// Calls the Google Generative AI API directly (reads GOOGLE_GENERATIVE_AI_API_KEY).
// No gateway or other third party sits in front of it.
const MODEL = google("gemini-2.5-flash");

// Statuses the model is allowed to propose. Terminal-by-neglect states like
// "ghosted" or "not_applied" can't be inferred from a single email, so they are
// left off the menu.
const SUGGESTABLE_STATUSES = [
    "applied",
    "online_assessment",
    "takehome",
    "interviewing",
    "onsite",
    "offer_in_progress",
    "offer_accepted",
    "offer_declined",
    "offer_rescinded",
    "rejected",
] as const;

export type ClassifierApplication = {
    company: string;
    role: string | null;
    currentStatus: ApplicationStatus;
};

export type EmailMatch = {
    emailIndex: number;
    applicationIndex: number;
    suggestedStatus: ApplicationStatus;
    confidence: number;
    reasoning: string;
};

const matchSchema = z.object({
    emailIndex: z
        .number()
        .int()
        .describe("Index of the email from the EMAILS list."),
    applicationIndex: z
        .number()
        .int()
        .describe(
            "Index of the matching application from the APPLICATIONS list.",
        ),
    suggestedStatus: z
        .enum(SUGGESTABLE_STATUSES)
        .describe("The status this email implies the application has reached."),
    confidence: z
        .number()
        .min(0)
        .max(1)
        .describe("How sure you are about both the match and the status."),
    reasoning: z
        .string()
        .describe("One short sentence citing the evidence from the email."),
});

const SYSTEM_PROMPT = [
    "You link a person's inbox emails to the job applications they are tracking.",
    "For each email that clearly reports a change in one of the tracked",
    "applications (an interview invite, online assessment, offer, rejection,",
    "application confirmation, etc.), return a match. Identify the company from",
    "the sender's domain and the email content, then find the single tracked",
    "application for that company. If no tracked application clearly matches, or",
    "the email is not about a job application, do not return an entry for it.",
    "Never guess a company that is not in the APPLICATIONS list. Only propose a",
    "status that reflects what the email actually says.",
].join(" ");

const buildPrompt = (
    applications: ClassifierApplication[],
    emails: NormalizedEmail[],
): string => {
    const statusMenu = SUGGESTABLE_STATUSES.map(
        (status) => `${status} (${STATUS_META[status].label})`,
    ).join(", ");

    const appLines = applications
        .map(
            (app, index) =>
                `[${index}] ${app.company}` +
                (app.role ? ` — ${app.role}` : "") +
                ` (current status: ${app.currentStatus})`,
        )
        .join("\n");

    const emailLines = emails
        .map(
            (email, index) =>
                `[${index}] From: ${email.from}\n` +
                `Subject: ${email.subject}\n` +
                `Body: ${email.body || email.snippet}`,
        )
        .join("\n\n---\n\n");

    return [
        `Allowed statuses: ${statusMenu}`,
        "",
        "APPLICATIONS:",
        appLines,
        "",
        "EMAILS:",
        emailLines,
    ].join("\n");
};

// Returns confident matches only. An empty applications or emails list short
// circuits before spending a model call.
export const classifyEmails = async (
    applications: ClassifierApplication[],
    emails: NormalizedEmail[],
): Promise<EmailMatch[]> => {
    if (applications.length === 0 || emails.length === 0) return [];

    const { object } = await generateObject({
        model: MODEL,
        schema: z.object({ matches: z.array(matchSchema) }),
        system: SYSTEM_PROMPT,
        prompt: buildPrompt(applications, emails),
    });

    return object.matches
        .filter(
            (match) =>
                match.emailIndex >= 0 &&
                match.emailIndex < emails.length &&
                match.applicationIndex >= 0 &&
                match.applicationIndex < applications.length,
        )
        .map((match) => ({
            emailIndex: match.emailIndex,
            applicationIndex: match.applicationIndex,
            suggestedStatus: match.suggestedStatus as ApplicationStatus,
            confidence: match.confidence,
            reasoning: match.reasoning,
        }));
};
