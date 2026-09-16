import type { NormalizedEmail } from "@/lib/email/types";

// The classifier is handed every application the user tracks, which for a real
// list runs to four figures. That is a needle in a haystack for the model and a
// large prompt to pay for on every batch, so the list is narrowed first to the
// companies an email could plausibly be about.
//
// The filter only has to be right in one direction. Letting a company through
// that the email never mentions costs a line of prompt; holding one back that
// it does mention loses the update entirely. Everything here is therefore
// written to be generous, and nothing rejects on a close call.

// Punctuation and spacing should never decide a match, so "Point-72",
// "Point 72" and "point72" all reduce to comparable shapes.
const normalize = (text: string): string =>
    text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

// Words that say a company is a company rather than which one it is. An email
// says "Google", the tracked row often says "Google LLC", and the difference
// must not decide the match.
const LEGAL_WORDS = new Set([
    "inc",
    "incorporated",
    "llc",
    "llp",
    "ltd",
    "limited",
    "corp",
    "corporation",
    "co",
    "company",
    "plc",
    "gmbh",
    "ag",
    "sa",
    "nv",
    "bv",
    "ab",
    "oy",
    "pty",
    "pte",
    "srl",
    "spa",
    "kk",
    "the",
    "and",
]);

type CompanyKeys = {
    // The parts of the name worth searching for. Legal words go, and so do
    // single letters, which match everywhere and mean nothing.
    parts: string[];
    // Forms to look for with the spacing taken out of both sides. Only names
    // whose spacing is genuinely in doubt get one, because a bare word is
    // already matched exactly and a loose substring would answer to any word
    // that happens to contain it: a company called "Test" would otherwise be a
    // candidate for every email carrying the word "latest".
    glued: string[];
};

const companyKeysFor = (company: string): CompanyKeys => {
    const parts = normalize(company)
        .split(" ")
        .filter((word) => word.length > 1 && !LEGAL_WORDS.has(word));

    const glued: string[] = [];
    // Runs of neighbouring parts, which is how a name meets the shortened form
    // a company puts in its own domain: "Tower Research Capital" is written to
    // from towerresearch.com.
    for (let from = 0; from < parts.length; from += 1) {
        for (let to = from + 2; to <= parts.length; to += 1) {
            glued.push(parts.slice(from, to).join(""));
        }
    }
    // A lone part is only worth gluing when it carries a digit, which is the
    // one case where a name is written both ways: "Point72" and "Point 72".
    if (parts.length === 1 && /\d/.test(parts[0])) glued.push(parts[0]);

    return { parts, glued };
};

// Every word of an email that could carry a company name: who sent it, what
// they called it, and what they wrote. The address is included whole, so the
// domain in "careers@ramp.com" is read along with the prose.
const wordsIn = (email: NormalizedEmail): string[] =>
    normalize(
        `${email.from} ${email.subject} ${email.snippet} ${email.body}`,
    ).split(" ");

// The names are indexed once and each email is then read once against the
// index. Comparing every application against every email instead meant scanning
// a whole message body once per tracked company, which for a list in the
// thousands is the same few kilobytes read thousands of times over.

// Glued forms have to be found anywhere inside a word, not just as whole words:
// a company writes from careers@capitalonecareers.com and the name is buried in
// the middle of the token. Searching the text once per form is what made the
// old pass quadratic, so the forms go into a trie and one walk of the text
// finds all of them at once.
type GluedNode = {
    children: Map<string, GluedNode>;
    companies: number[] | null;
};

const gluedNode = (): GluedNode => ({ children: new Map(), companies: null });

const addGlued = (root: GluedNode, form: string, at: number): void => {
    let node = root;
    for (const character of form) {
        let child = node.children.get(character);
        if (!child) {
            child = gluedNode();
            node.children.set(character, child);
        }
        node = child;
    }
    (node.companies ??= []).push(at);
};

type CompanyIndex = {
    byPart: Map<string, number[]>;
    glued: GluedNode;
    // Distinct parts per company, which is what "every part present" counts
    // against.
    partCounts: number[];
};

const indexCompanies = (
    applications: readonly { company: string }[],
): CompanyIndex => {
    const byPart = new Map<string, number[]>();
    const glued = gluedNode();
    const partCounts: number[] = [];

    applications.forEach((application, at) => {
        const keys = companyKeysFor(application.company);
        const distinct = new Set(keys.parts);
        partCounts[at] = distinct.size;
        for (const part of distinct) {
            const held = byPart.get(part);
            if (held) held.push(at);
            else byPart.set(part, [at]);
        }
        for (const form of keys.glued) addGlued(glued, form, at);
    });

    return { byPart, glued, partCounts };
};

// Every company whose glued form appears anywhere in the text.
const walkGlued = (
    root: GluedNode,
    text: string,
    keep: (at: number) => void,
): void => {
    for (let from = 0; from < text.length; from += 1) {
        let node = root;
        for (let at = from; at < text.length; at += 1) {
            const child = node.children.get(text[at]);
            if (!child) break;
            node = child;
            if (node.companies)
                for (const company of node.companies) keep(company);
        }
    }
};

export type Candidates<T> = {
    applications: T[];
    emails: NormalizedEmail[];
};

// Both sides of the same question: which applications and which emails could
// be about each other. An application no email names has nothing to answer
// for, and an email naming nobody tracked is somebody's electricity bill. Both
// are dropped, each side keeping the order it came in.
//
// Dropping emails matters more than it looks. Once the applications are
// narrowed they cost a line each, while every email carries its whole body, so
// an unnarrowed batch is nearly the entire prompt.
export const candidatesFor = <T extends { company: string }>(
    applications: readonly T[],
    emails: readonly NormalizedEmail[],
): Candidates<T> => {
    const index = indexCompanies(applications);
    const named = new Set<number>();
    const naming = new Set<number>();

    emails.forEach((email, by) => {
        const words = wordsIn(email);
        const keep = (at: number) => {
            named.add(at);
            naming.add(by);
        };

        // Searched with the spacing taken out of both sides, which is how a
        // name meets a domain that runs it together or drops its last word, and
        // how "Point 72" meets a row reading "Point72".
        walkGlued(index.glued, words.join(""), keep);

        // How many distinct parts of each name the email writes out as words.
        const present = new Map<number, number>();
        for (const word of new Set(words)) {
            for (const at of index.byPart.get(word) ?? []) {
                present.set(at, (present.get(at) ?? 0) + 1);
            }
        }

        // Every part present is how a row reading "Google LLC" meets an email
        // that only ever says "Google". Two parts is how "Tower Research
        // Capital" meets one that calls it "Tower Research". Two and not one:
        // a single word carries too little, and "American Express" would answer
        // to any mail with "American" in it.
        for (const [at, count] of present) {
            if (count === index.partCounts[at] || count >= 2) keep(at);
        }
    });

    return {
        applications: applications.filter((_, at) => named.has(at)),
        emails: emails.filter((_, by) => naming.has(by)),
    };
};
