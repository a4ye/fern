import type { ListStatus } from "@/components/dashboard/data";
import { LIST_DESCRIPTION_MAX, LIST_NAME_MAX } from "@/lib/constraints";

type ParsedListInput = {
    name: string;
    description: string | null;
};

type ParsedListUpdate = ParsedListInput & { status: ListStatus };

type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

const LIST_STATUSES: readonly ListStatus[] = ["active", "closed", "archived"];

export const parseListInput = ({
    name,
    description,
}: {
    name: string;
    description: string | null;
}): ParseResult<ParsedListInput> => {
    const normalizedName = name.trim();
    if (!normalizedName) return { ok: false, error: "Name is required." };
    if (normalizedName.length > LIST_NAME_MAX) {
        return {
            ok: false,
            error: `Name must be ${LIST_NAME_MAX} characters or fewer.`,
        };
    }

    const normalizedDescription = description?.trim() ?? "";
    if (normalizedDescription.length > LIST_DESCRIPTION_MAX) {
        return {
            ok: false,
            error: `Description must be ${LIST_DESCRIPTION_MAX} characters or fewer.`,
        };
    }

    return {
        ok: true,
        data: {
            name: normalizedName,
            description: normalizedDescription || null,
        },
    };
};

export const parseListUpdate = ({
    name,
    description,
    status,
}: {
    name: string;
    description: string | null;
    status: ListStatus;
}): ParseResult<ParsedListUpdate> => {
    const parsed = parseListInput({ name, description });
    if (!parsed.ok) return parsed;
    if (!LIST_STATUSES.includes(status)) {
        return { ok: false, error: "Choose a valid status." };
    }
    return { ok: true, data: { ...parsed.data, status } };
};
