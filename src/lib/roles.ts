// The titles people apply under, as a small hand-written vocabulary, so the
// role field can be picked rather than typed out.

import { containsMatch, searchScore } from "@/lib/fuzzy";

type RoleSeed = {
    title: string;
    // Only the shorthand a title does not contain. A word already written in
    // the title is found without help.
    aliases?: readonly string[];
};

// Ordered by how often a title is applied under: the head of this list is what
// an empty field offers, and a tie in search falls back to it.
const ROLE_SEEDS: readonly RoleSeed[] = [
    { title: "Software Engineer", aliases: ["swe", "sde"] },
    {
        title: "Software Engineer Intern",
        aliases: ["swe intern", "sde intern"],
    },
    { title: "Software Developer" },
    { title: "Data Scientist" },
    { title: "Data Analyst" },
    { title: "Data Engineer" },
    { title: "Machine Learning Engineer", aliases: ["ml", "mle"] },
    { title: "Product Manager", aliases: ["pm"] },

    { title: "Frontend Engineer", aliases: ["front end", "fe"] },
    { title: "Backend Engineer", aliases: ["back end", "be"] },
    { title: "Full Stack Engineer", aliases: ["fullstack"] },
    { title: "Mobile Engineer" },
    { title: "iOS Engineer", aliases: ["swift"] },
    { title: "Android Engineer", aliases: ["kotlin"] },
    { title: "Web Developer" },
    { title: "Game Developer", aliases: ["gameplay"] },
    { title: "Embedded Software Engineer" },
    { title: "Firmware Engineer" },
    { title: "Systems Engineer" },
    { title: "Platform Engineer" },
    { title: "Infrastructure Engineer" },
    { title: "Site Reliability Engineer", aliases: ["sre"] },
    { title: "DevOps Engineer" },
    { title: "Cloud Engineer" },
    { title: "Security Engineer", aliases: ["appsec", "infosec"] },
    { title: "Network Engineer" },
    { title: "QA Engineer", aliases: ["quality assurance"] },
    { title: "Test Engineer", aliases: ["sdet"] },
    { title: "Automation Engineer" },
    { title: "Solutions Engineer", aliases: ["sales engineer"] },
    { title: "Solutions Architect" },
    { title: "Software Architect" },
    { title: "Developer Advocate", aliases: ["devrel"] },
    { title: "Engineering Manager" },
    { title: "Technical Program Manager", aliases: ["tpm"] },

    { title: "AI Engineer", aliases: ["artificial intelligence"] },
    { title: "Research Scientist" },
    { title: "Research Engineer" },
    { title: "Applied Scientist" },
    { title: "Analytics Engineer" },
    { title: "Business Intelligence Analyst", aliases: ["bi"] },
    { title: "Quantitative Analyst", aliases: ["quant"] },
    { title: "Quantitative Developer", aliases: ["quant dev"] },
    { title: "Statistician" },
    { title: "Database Administrator", aliases: ["dba"] },
    { title: "Systems Administrator", aliases: ["sysadmin"] },
    { title: "IT Support Specialist", aliases: ["help desk"] },

    { title: "Product Designer" },
    { title: "UX Designer", aliases: ["user experience"] },
    { title: "UI Designer", aliases: ["interface designer"] },
    { title: "UX Researcher", aliases: ["user research"] },
    { title: "Graphic Designer" },
    { title: "Technical Writer" },
    { title: "Product Analyst" },
    { title: "Associate Product Manager", aliases: ["apm"] },
    { title: "Program Manager" },
    { title: "Project Manager" },

    { title: "Business Analyst", aliases: ["ba"] },
    { title: "Financial Analyst" },
    { title: "Investment Banking Analyst" },
    { title: "Accountant" },
    { title: "Consultant" },
    { title: "Management Consultant" },
    { title: "Operations Analyst" },
    { title: "Operations Manager" },
    { title: "Marketing Analyst" },
    { title: "Marketing Manager" },
    { title: "Sales Development Representative", aliases: ["sdr"] },
    { title: "Account Executive" },
    { title: "Customer Success Manager", aliases: ["csm"] },
    { title: "Recruiter", aliases: ["talent acquisition"] },

    { title: "Mechanical Engineer" },
    { title: "Electrical Engineer" },
    { title: "Computer Engineer" },
    { title: "Civil Engineer" },
    { title: "Chemical Engineer" },
    { title: "Biomedical Engineer" },
    { title: "Industrial Engineer" },
    { title: "Manufacturing Engineer" },
    { title: "Process Engineer" },
    { title: "Project Engineer" },
];

type Modifier = {
    label: string;
    aliases: readonly string[];
};

// A rank in front of a title, and an intern word behind it, are how the same
// job is written at every level. Spelling both out against every role would
// bury the plain titles under their own variants, so a modifier is read off the
// query instead and put back on the result.
const RANKS: readonly Modifier[] = [
    { label: "Junior", aliases: ["junior", "jr"] },
    { label: "Associate", aliases: ["associate"] },
    { label: "Senior", aliases: ["senior", "sr"] },
    { label: "Staff", aliases: ["staff"] },
    { label: "Principal", aliases: ["principal"] },
    { label: "Lead", aliases: ["lead"] },
];

const LEVELS: readonly Modifier[] = [
    {
        label: "Intern",
        aliases: ["intern", "interns", "internship", "internships"],
    },
    { label: "Co-op", aliases: ["co op", "coop", "co ops", "coops"] },
];

const LEVEL_WORDS = Math.max(
    ...LEVELS.flatMap((level) =>
        level.aliases.map((alias) => alias.split(" ").length),
    ),
);

const normalize = (value: string): string =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

const ROLE_TITLES = ROLE_SEEDS.map((seed) => seed.title);

// Whether a title already carries a modifier, which is what keeps "Software
// Engineer Intern" from being offered back as "Software Engineer Intern Intern".
const mentions = (title: string, modifier: Modifier): boolean => {
    const padded = ` ${normalize(title)} `;
    return modifier.aliases.some((alias) => padded.includes(` ${alias} `));
};

type Query = {
    rank: Modifier | null;
    level: Modifier | null;
    base: string;
};

// A modifier is recognised half-typed, because "princip" is on the way to only
// one word and waiting for the "al" would leave the list empty. Three letters
// is where that stops being a guess: "st" is the start of Staff and Senior
// alike, and of plenty of titles besides.
const MODIFIER_PREFIX = 3;

const modifierFor = (
    phrase: string,
    modifiers: readonly Modifier[],
): Modifier | null => {
    const written = modifiers.find((entry) => entry.aliases.includes(phrase));
    if (written) return written;
    if (phrase.length < MODIFIER_PREFIX) return null;
    const started = modifiers.filter((entry) =>
        entry.aliases.some((alias) => alias.startsWith(phrase)),
    );
    return started.length === 1 ? started[0] : null;
};

const readQuery = (query: string): Query => {
    let words = query.split(" ").filter(Boolean);
    const rank = modifierFor(words[0], RANKS);
    if (rank) words = words.slice(1);

    let level: Modifier | null = null;
    for (let size = LEVEL_WORDS; size >= 1 && !level; size -= 1) {
        if (words.length < size) continue;
        level = modifierFor(words.slice(-size).join(" "), LEVELS);
        if (level) words = words.slice(0, -size);
    }

    return { rank, level, base: words.join(" ") };
};

// Kinds of match are scored a thousand apart, and within a kind the fuzzy
// module breaks ties by length, which here would put the Statistician above the
// Software Engineer. The kind is what is wanted; how often a title is applied
// under settles the rest.
const kindOf = (score: number): number => Math.floor(score / 1000);

// The weakest kind that starts a word: the title itself, the start of it, or
// the start of a word inside it. Below this the letters merely run through a
// word, the way "sen" meets "repreSENtative".
const WORD_START = 3;

const startsAWord = (query: string, title: string): boolean =>
    kindOf(searchScore(query, title)) >= WORD_START;

const seedsFor = (query: string): readonly RoleSeed[] => {
    const matches = ROLE_SEEDS.map((seed, order) => ({
        seed,
        order,
        score: searchScore(query, seed.title, seed.aliases ?? []),
        written: containsMatch(query, seed.title),
    })).filter((match) => match.score > 0);

    // A query written into a title never competes with the same letters
    // scattered through another: "mechanical" is a Mechanical Engineer, not a
    // Technical Writer. Only the scatterings go: shorthand still reaches the
    // titles it stands for, because an alias is the stronger kind of match.
    const floor = Math.max(
        0,
        ...matches
            .filter((match) => match.written)
            .map((match) => kindOf(match.score)),
    );
    return matches
        .filter((match) => match.written || kindOf(match.score) >= floor)
        .sort(
            (left, right) =>
                kindOf(right.score) - kindOf(left.score) ||
                left.order - right.order,
        )
        .map((match) => match.seed);
};

// A modifier is only ever built onto a plain title. "Software Engineer Intern"
// is already written the way somebody asked for, and taking a rank or a second
// intern word would leave it saying something nobody is hired as.
const isPlain = (title: string): boolean =>
    ![...RANKS, ...LEVELS].some((modifier) => mentions(title, modifier));

const withModifiers = ({ rank, level, base }: Query): string[] => {
    if (!rank && !level) return [];
    const seeds = base ? seedsFor(base) : ROLE_SEEDS;
    return seeds
        .filter((seed) => isPlain(seed.title))
        .map((seed) =>
            [rank?.label, seed.title, level?.label].filter(Boolean).join(" "),
        );
};

const unique = (titles: readonly string[], limit: number): string[] => {
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const title of titles) {
        const key = normalize(title);
        if (seen.has(key)) continue;
        seen.add(key);
        kept.push(title);
        if (kept.length >= limit) break;
    }
    return kept;
};

export const searchRoleTitles = (raw: string, limit = 8): string[] => {
    if (limit < 1) return [];
    const query = normalize(raw);
    if (!query) return ROLE_TITLES.slice(0, limit);

    const read = readQuery(query);
    const written = seedsFor(query).map((seed) => seed.title);
    const built = withModifiers(read);

    // A modifier written against a role is the exact reading of the query, so
    // "senior data" leads with a senior data role. A modifier on its own is
    // not, so "intern" leads with the titles that begin a word with it, and
    // only those: a modifier is a whole word, so a title that merely runs
    // through the same letters is answering something else.
    if (read.base) return unique([...built, ...written], limit);
    const spelled = written.filter((title) => startsAWord(query, title));
    return unique([...spelled, ...built, ...written], limit);
};
