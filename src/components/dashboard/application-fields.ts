import type { Arrangement, PayPeriod } from "@/components/dashboard/data";
import { DEFAULT_CURRENCY } from "@/lib/pay";

export type ApplicationFields = {
    company: string;
    role: string;
    location: string;
    arrangement: Arrangement | null;
    appliedAt: string;
    url: string;
    payMin: string;
    payMax: string;
    payCurrency: string;
    payPeriod: PayPeriod | null;
    bonus: string;
    payNote: string;
    notes: string;
};

export const EMPTY_FIELDS: ApplicationFields = {
    company: "",
    role: "",
    location: "",
    arrangement: null,
    appliedAt: "",
    url: "",
    payMin: "",
    payMax: "",
    payCurrency: DEFAULT_CURRENCY,
    payPeriod: null,
    bonus: "",
    payNote: "",
    notes: "",
};
