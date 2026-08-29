export type LocalDateTimeLabels = {
    dateKey: string;
    day: string;
    date: string;
    time: string;
    compact: string;
    exact: string;
};

export type LocalDateTimeFormatter = (
    dateTime: string,
) => LocalDateTimeLabels | null;

// Created in the browser so Intl uses the person's own locale, hour cycle and
// time zone. Passing both arguments keeps the formatter deterministic in tests.
export const createLocalDateTimeFormatter = (
    locales?: Intl.LocalesArgument,
    timeZone?: string,
): LocalDateTimeFormatter => {
    const zone = timeZone ? { timeZone } : {};
    const dayFormatter = new Intl.DateTimeFormat(locales, {
        dateStyle: "full",
        ...zone,
    });
    const dateFormatter = new Intl.DateTimeFormat(locales, {
        dateStyle: "medium",
        ...zone,
    });
    const timeFormatter = new Intl.DateTimeFormat(locales, {
        hour: "numeric",
        minute: "2-digit",
        ...zone,
    });
    const compactFormatter = new Intl.DateTimeFormat(locales, {
        dateStyle: "medium",
        timeStyle: "short",
        ...zone,
    });
    const exactFormatter = new Intl.DateTimeFormat(locales, {
        dateStyle: "full",
        timeStyle: "short",
        ...zone,
    });
    const dateKeyFormatter = new Intl.DateTimeFormat(
        "en-CA-u-ca-gregory-nu-latn",
        {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            ...zone,
        },
    );

    return (dateTime) => {
        const date = new Date(dateTime);
        if (Number.isNaN(date.getTime())) return null;

        const dateParts = new Map(
            dateKeyFormatter
                .formatToParts(date)
                .map((part) => [part.type, part.value]),
        );
        const year = dateParts.get("year");
        const month = dateParts.get("month");
        const dayOfMonth = dateParts.get("day");
        if (!year || !month || !dayOfMonth) return null;

        return {
            dateKey: `${year}-${month}-${dayOfMonth}`,
            day: dayFormatter.format(date),
            date: dateFormatter.format(date),
            time: timeFormatter.format(date),
            compact: compactFormatter.format(date),
            exact: exactFormatter.format(date),
        };
    };
};
