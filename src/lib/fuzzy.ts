// Ranked, typo-tolerant matching for small option lists. Every candidate is
// scored on every keystroke, which is cheaper than maintaining an index at this
// size and keeps ranking exact rather than approximate.

// Tiers are spaced far apart so within-tier tuning can never let a weaker kind
// of match outrank a stronger one.
const EXACT = 6000;
const PREFIX = 5000;
const WORD_PREFIX = 4000;
const SUBSTRING = 3000;
const SUBSEQUENCE = 2000;
const TYPO = 1000;

// Shorter targets win ties: "Offer" should sit above "Offer in progress" for
// the query "offer". Capped below the tier gap so it stays a tiebreak.
const lengthTiebreak = (target: string) => Math.min(target.length, 99);

// An alias hit ranks below a label hit of the same tier, but still above a
// label hit of a weaker tier, so a spot-on alias beats a loose label match.
const KEYWORD_PENALTY = 500;

// Punctuation and spacing should never decide a match, so "Take-home",
// "take home" and "takehome" all collapse to the same shape.
const normalize = (text: string) =>
    text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

const wordsOf = (normalized: string) =>
    normalized ? normalized.split(" ") : [];

// Typos are only forgiven once a query is long enough that a correction is more
// likely than a different word entirely. At two characters, every status is one
// edit from every other.
const allowance = (length: number) => (length < 4 ? 0 : length < 7 ? 1 : 2);

// Optimal string alignment: Levenshtein plus adjacent transposition, which is
// the single most common typing mistake. Bails out as soon as every alignment
// in flight already exceeds `max`.
const editDistance = (a: string, b: string, max: number): number => {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    if (a === b) return 0;

    let beforePrevious: number[] = [];
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

    for (let i = 1; i <= a.length; i += 1) {
        const current = [i];
        let best = i;
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            let distance = Math.min(
                previous[j] + 1,
                current[j - 1] + 1,
                previous[j - 1] + cost,
            );
            if (
                i > 1 &&
                j > 1 &&
                a[i - 1] === b[j - 2] &&
                a[i - 2] === b[j - 1]
            ) {
                distance = Math.min(distance, beforePrevious[j - 2] + 1);
            }
            current[j] = distance;
            best = Math.min(best, distance);
        }
        if (best > max) return max + 1;
        beforePrevious = previous;
        previous = current;
    }

    return previous[b.length];
};

// Rewards characters found in order, weighting runs so "onas" scores higher
// against "online assessment" than the same letters scattered would.
const subsequenceBonus = (query: string, target: string): number => {
    let index = 0;
    let run = 0;
    let bonus = 0;
    for (const character of target) {
        if (index === query.length) break;
        if (character === query[index]) {
            index += 1;
            run += 1;
            bonus += run;
        } else {
            run = 0;
        }
    }
    return index === query.length ? bonus : 0;
};

const typoScore = (query: string, target: string): number => {
    const max = allowance(query.length);
    if (max === 0) return 0;

    let best = max + 1;
    for (const candidate of [target, ...wordsOf(target)]) {
        best = Math.min(best, editDistance(query, candidate, max));
        // A query is usually the start of a longer word, so the unwritten tail
        // of the candidate should not count as a string of deletions.
        if (candidate.length > query.length) {
            best = Math.min(
                best,
                editDistance(query, candidate.slice(0, query.length), max),
            );
        }
        if (best === 0) break;
    }

    return best <= max ? TYPO - best * 300 - lengthTiebreak(target) : 0;
};

// Scores one query against one string. 0 means no match; higher is better.
export const matchScore = (rawQuery: string, rawTarget: string): number => {
    const query = normalize(rawQuery);
    const target = normalize(rawTarget);
    if (!query || !target) return 0;

    const tiebreak = lengthTiebreak(target);
    if (query === target) return EXACT;
    if (target.startsWith(query)) return PREFIX - tiebreak;
    if (wordsOf(target).some((word) => word.startsWith(query))) {
        return WORD_PREFIX - tiebreak;
    }
    if (target.includes(query)) return SUBSTRING - tiebreak;

    const bonus = subsequenceBonus(query, target);
    if (bonus > 0) return SUBSEQUENCE + Math.min(bonus, 900) - tiebreak;

    return typoScore(query, target);
};

// Scores a query against an option's visible label and its hidden search terms.
export const searchScore = (
    query: string,
    label: string,
    keywords: readonly string[] = [],
): number => {
    let best = matchScore(query, label);
    for (const keyword of keywords) {
        const score = matchScore(query, keyword);
        if (score > 0) best = Math.max(best, score - KEYWORD_PENALTY);
    }
    return best;
};
