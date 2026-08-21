// A posting title is written for a careers page rather than for a list. It
// carries the term the job runs in, the employer's own name, and a restatement
// that the job is an internship, none of which tell one row from another.
//
// Only noise that is structural is removed: a time expression, a name the row
// already records, or a whole bracket or clause that says nothing but "this is
// an internship". Deciding by the word alone does not survive contact with a
// second field of work, because the words a careers page wraps around a job
// are the same words other jobs are named after. "Program Manager", "Fall
// Protection Engineer", "Equal Opportunity Officer" and "Spring Boot Developer"
// each read as pure marketing to a rule that only knows the vocabulary of
// software internships. So a word is never cut for being on a list: it is cut
// for being a date, a duplicate, or the whole of a clause that carries nothing
// else.

const SEASONS = "winter|spring|summer|fall|autumn";
const MONTHS =
    "january|february|march|april|june|july|august|september|october|november|december|may" +
    "|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec";
// A posting names its term as a season, a month, or a run of either: "Summer
// 2026", "May 2026", "Summer-Fall 2026", "Summer/May 2026".
const TERM = `(?:${SEASONS}|${MONTHS})`;
const INTERNS = "intern|interns|internship|internships|co-?op|co-?ops";

// True of the whole title, and the gate on every rule that could mistake a
// noun for a date. A posting that never says internship is one this module
// knows nothing about, and it is left almost entirely alone.
const SAYS_INTERN = new RegExp(`\\b(?:${INTERNS})\\b`, "i");

// A date says when the job runs, never what it is. A term written against a
// year is matched ahead of the bare year, so "Summer 2027" leaves nothing
// stranded, and a duration is matched as a whole phrase, so "4 or 8 months"
// does not leave a loose "4 or" behind.
const TIME_NOISE: RegExp[] = [
    new RegExp(
        `\\b${TERM}(?:(?:\\s*[-–—/]\\s*|\\s+(?:to|or|through|until|and)\\s+)${TERM})*` +
            `\\s+(?:of\\s+)?(?:19|20)?\\d{2}\\b`,
        "gi",
    ),
    new RegExp(`\\b(?:19|20)\\d{2}\\s+${TERM}\\b`, "gi"),
    /\bfy\s?(?:19|20)?\d{2}\b/gi,
    // The two numbers of "4 or 8 months" go together. A dash is deliberately
    // not one of the joiners: in "Data Scientist 1 - 4 Month Co-op" it
    // separates the level from the term rather than joining two lengths.
    /\b\d{1,2}(?:\s+(?:or|to|and)\s+\d{1,2})?\s*[-–—]?\s*months?\b/gi,
];

// A bare year is a hiring year in "Software Engineer Intern (2026)" and a
// product in "Windows 2000 Administrator", so it only goes where the title has
// already said it is an internship. Never when a word is hyphenated onto it,
// which would leave the "mid" of "Start mid-2026" behind.
const BARE_YEAR = /(?<![-\w])(?:19|20)\d{2}\b/g;

// Likewise a bare season, which additionally has to be touching the intern word
// to count: that is the difference between "Summer Intern" and the "Summer" in
// "Summer Camp Counselor Intern".
const SEASON_BEFORE_INTERN = new RegExp(
    `(?<![-\\w])(?:${SEASONS})\\s+(?=(?:${INTERNS})\\b)`,
    "gi",
);
const SEASON_AFTER_INTERN = new RegExp(
    `(\\b(?:${INTERNS})\\s+)(?:${SEASONS})\\b(?!-)`,
    "gi",
);

// Phrases, not words. "Student Opportunities" is never what a job is called,
// whereas "Student" and "Opportunity" on their own are half the titles in
// healthcare and government.
const PHRASE_NOISE: RegExp[] = [
    new RegExp(
        `\\b(?:(?:${SEASONS})\\s+)?students?\\s+opportunit(?:y|ies)\\b`,
        "gi",
    ),
];

// "Internship Opportunities" advertises the internship it has already named.
// Touching the intern word is what makes it safe to cut: an Equal Opportunity
// Officer keeps the word that names the job.
const OPENING_BESIDE_INTERN = new RegExp(
    `\\bopportunit(?:y|ies)\\s+(?=(?:${INTERNS})\\b)|(\\b(?:${INTERNS})\\s+)opportunit(?:y|ies)\\b`,
    "gi",
);

const INTERN_WORD = new RegExp(`^(?:${INTERNS})$`, "i");
const CO_OP_WORD = /^co-?ops?$/i;

// Filler that a careers page pads the word "internship" out with. These are
// only ever consulted inside a clause that already says internship, and never
// on their own, because every one of them is a job somewhere: a Program
// Manager, a Student Success Manager, an Application Engineer.
const FILLER_WORDS = new Set([
    "winter",
    "spring",
    "summer",
    "fall",
    "autumn",
    "opportunity",
    "opportunities",
    "programme",
    "programmes",
    "program",
    "programs",
    "campus",
    "student",
    "students",
    "university",
    "college",
    "first-year",
    "undergraduate",
    "undergrad",
    "hiring",
    "recruitment",
    "recruiting",
    "application",
    "applications",
    "position",
    "positions",
    "opening",
    "openings",
    "role",
    "roles",
    "early",
    "career",
    "careers",
]);

const GRAMMAR_WORDS = new Set([
    "a",
    "an",
    "the",
    "for",
    "of",
    "in",
    "at",
    "on",
    "and",
    "or",
    "to",
    "with",
]);

// A bracketed aside is judged whole, so "(Summer 2027)" goes and "(First Play)"
// stays: the second names the team, which is the kind of detail worth keeping.
const BRACKETED = /\s*[([]([^)\]]*)[)\]]\s*/g;

// A dash only separates when it has air on one side, which is what keeps
// "Full-Stack" and "Co-op" in one piece.
const SEPARATOR = /(\s*[|:;,]\s*|\s*[-–—]\s+|\s+[-–—]\s*)/;

type Part = "keep" | "drop" | "intern";

const compare = (value: string): string =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const wordsIn = (segment: string): string[] =>
    segment
        .toLowerCase()
        .split(/[\s/\\+&,]+/)
        .map((word) => word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
        .filter(Boolean);

// A clause survives unless it has nothing in it, repeats the company, or is a
// restatement that the job is an internship. Anything else is somebody's job
// title, whatever it is built out of.
const classify = (segment: string, company: string): Part => {
    const words = wordsIn(segment).filter((word) => !GRAMMAR_WORDS.has(word));
    if (words.length === 0) return "drop";
    if (company && compare(segment) === company) return "drop";
    if (!words.some((word) => INTERN_WORD.test(word))) return "keep";
    return words.every(
        (word) => INTERN_WORD.test(word) || FILLER_WORDS.has(word),
    )
        ? "intern"
        : "keep";
};

const tidySpacing = (value: string): string =>
    value
        .replace(/\s+/g, " ")
        .replace(/\s+([,;:])/g, "$1")
        // Cutting a clause out of the middle can leave a dash against the word
        // before it. A dash with air on only one side was a separator, so it
        // gets its air back; one with none is inside a word like "Full-Stack".
        .replace(/(\S)([-–—]) /g, "$1 $2 ")
        .replace(/ ([-–—])(\S)/g, " $1 $2")
        .replace(/\s+/g, " ")
        .replace(/^[\s\-–—|:;,]+|[\s\-–—|:;,]+$/g, "");

// "Software Engineering Intern" names a discipline where the row wants a job,
// and every other title in the list says "Engineer". The rule is deliberately
// narrow: the discipline must be qualified, so "Engineering Intern" stays as
// written rather than becoming the odder "Engineer Intern", and a word that
// only looks similar, like "Business Development Intern", is left alone.
const nameTheRole = (value: string): string =>
    value
        .replace(/\bintern(?:ship)?s?\b/gi, "Intern")
        .replace(/\bco-?ops?\b/gi, "Co-op")
        .replace(
            /(\S+\s+)engineering\b(?=\s+(?:Intern|Co-op)\b)/gi,
            "$1Engineer",
        );

export const tidyRoleTitle = (raw: string, companyName = ""): string => {
    const original = raw.trim();
    if (!original) return original;

    const company = compare(companyName);
    let text = original;
    for (const pattern of [...TIME_NOISE, ...PHRASE_NOISE]) {
        text = text.replace(pattern, " ");
    }
    if (SAYS_INTERN.test(original)) {
        text = text
            .replace(BARE_YEAR, " ")
            .replace(SEASON_BEFORE_INTERN, "")
            .replace(SEASON_AFTER_INTERN, "$1")
            .replace(OPENING_BESIDE_INTERN, "$1");
    }

    const dropped: string[] = [];
    const takeIntern = (segment: string) => {
        dropped.push(
            ...wordsIn(segment).filter((word) => INTERN_WORD.test(word)),
        );
    };

    text = text.replace(BRACKETED, (match, inner: string) => {
        const part = classify(inner, company);
        if (part === "keep") return match;
        if (part === "intern") takeIntern(inner);
        return " ";
    });

    // `split` with a capturing group hands back the separators alongside the
    // segments, so a segment that survives can be rejoined by the punctuation
    // the posting actually used rather than one chosen here.
    const pieces = text.split(SEPARATOR);
    let tidied = "";
    for (let index = 0; index < pieces.length; index += 2) {
        const segment = pieces[index];
        // A number in front is the requisition, as in "016:Summer Intern". One
        // behind is a level or the top of a range, as in "Levels 1 - 5", so
        // position is the whole of the difference between them.
        if (index === 0 && /^\d+$/.test(segment.trim())) continue;
        const part = classify(segment, company);
        if (part === "intern") takeIntern(segment);
        if (part !== "keep") continue;
        tidied += tidied ? pieces[index - 1] : "";
        tidied += segment.trim();
    }

    tidied = nameTheRole(tidySpacing(tidied));

    // A clause that was nothing but "Internship" is put back as the one word
    // the rest of the list uses, at the end, where the level and seniority in
    // front of it stay in reading order.
    const last = wordsIn(tidied).at(-1) ?? "";
    if (dropped.length > 0 && tidied && !INTERN_WORD.test(last)) {
        tidied += dropped.every((word) => CO_OP_WORD.test(word))
            ? " Co-op"
            : " Intern";
    }

    return tidied || original;
};
