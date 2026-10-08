import type {
    Arrangement,
    PayPeriod,
    Ranking,
} from "@/components/dashboard/data";
import { DEFAULT_CURRENCY } from "@/lib/pay";

export type ApplicationFields = {
    company: string;
    role: string;
    location: string;
    arrangement: Arrangement | null;
    ranking: Ranking | null;
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
    ranking: null,
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
