// Shared by the live list rows and their loading placeholders. Keeping the
// right-hand columns fixed prevents the application count, localized date, and
// action buttons from moving when a skeleton is replaced or the date hydrates.
export const LIST_ROW_MAIN = "flex min-w-0 flex-1 items-center gap-4 px-5 py-4";

export const LIST_ROW_META =
    "hidden shrink-0 grid-cols-[7rem_9rem] items-baseline gap-6 text-sm text-sub sm:grid";

export const LIST_ROW_ACTION = "flex w-10 shrink-0 items-center justify-center";

export const LIST_ROW_PIN_ACTION =
    "flex w-12 shrink-0 items-center justify-center";
