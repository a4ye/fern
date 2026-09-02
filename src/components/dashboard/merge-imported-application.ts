import type { ApplicationFields } from "@/components/dashboard/application-form";
import type { ScrapedPosting } from "@/lib/job-import/shared";
import { parsePay, payAmountInput } from "@/lib/pay";
import { PAY_MAX } from "@/lib/validation";

// A posting may name equity, a bonus and commission all with ranges of their
// own, which is longer than the field will take. Whole entries are dropped from
// the end rather than the text cut mid-amount, which would read as a figure the
// posting never gave.
const noteWithinLimit = (note: string): string => {
    if (note.length <= PAY_MAX) return note;
    const entries = note.split(", ");
    while (entries.length > 1) {
        entries.pop();
        const shorter = entries.join(", ");
        if (shorter.length <= PAY_MAX) return shorter;
    }
    return entries[0].slice(0, PAY_MAX);
};

export const mergeImportedApplication = (
    current: ApplicationFields,
    posting: ScrapedPosting,
    edited: ReadonlySet<keyof ApplicationFields>,
    defaultCurrency: string,
): ApplicationFields => {
    const pay = parsePay(posting.pay, defaultCurrency);

    return {
        ...current,
        company: edited.has("company")
            ? current.company
            : (posting.company ?? ""),
        role: edited.has("role") ? current.role : (posting.role ?? ""),
        location: edited.has("location")
            ? current.location
            : (posting.location ?? ""),
        arrangement: edited.has("arrangement")
            ? current.arrangement
            : posting.arrangement,
        payMin: edited.has("payMin")
            ? current.payMin
            : payAmountInput(pay.payMin),
        payMax: edited.has("payMax")
            ? current.payMax
            : payAmountInput(pay.payMax),
        payCurrency: edited.has("payCurrency")
            ? current.payCurrency
            : pay.payCurrency,
        payPeriod: edited.has("payPeriod") ? current.payPeriod : pay.payPeriod,
        // What the board said about equity or a bonus, and otherwise whatever
        // of the pay text could not be read as an amount.
        payNote: edited.has("payNote")
            ? current.payNote
            : noteWithinLimit(posting.payNote ?? pay.payNote ?? ""),
    };
};
