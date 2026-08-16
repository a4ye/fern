import type { ApplicationFields } from "@/components/dashboard/application-form";
import type { ScrapedPosting } from "@/lib/job-import/shared";
import { parsePay, payAmountInput } from "@/lib/pay";

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
        payNote: edited.has("payNote") ? current.payNote : (pay.payNote ?? ""),
    };
};
