"use client";

import { searchImportedLocations } from "@/app/dashboard/actions";
import { SuggestInput } from "@/components/dashboard/suggest-input";
import {
    normalizeLocationPhrase,
    searchPopularLocations,
} from "@/lib/job-import/location";
import { LOCATION_MAX } from "@/lib/constraints";

// Keystrokes are answered from the technology-hub list held in the bundle, and
// the rest of the world arrives from the server behind the debounce.
export const LocationInput = ({
    value,
    onChange,
    className,
    disabled = false,
    promotedSuggestions = [],
    onDismissPromotedSuggestions,
}: {
    value: string;
    onChange: (value: string) => void;
    className: string;
    disabled?: boolean;
    promotedSuggestions?: readonly string[];
    onDismissPromotedSuggestions?: () => void;
}) => (
    <SuggestInput
        label="Location"
        value={value}
        onChange={onChange}
        className={className}
        disabled={disabled}
        maxLength={LOCATION_MAX}
        suggest={searchPopularLocations}
        search={searchImportedLocations}
        normalize={normalizeLocationPhrase}
        promoted={promotedSuggestions}
        onDismissPromoted={onDismissPromotedSuggestions}
        header={
            <p
                role="status"
                className="flex shrink-0 items-start gap-2 border-b border-faint bg-surface px-3 py-2.5 text-pretty text-xs text-sub"
            >
                <span
                    aria-hidden="true"
                    className="icon-[lucide--map-pin] mt-px size-3.5 shrink-0 text-accent-deep"
                />
                Which location did the posting mean?
            </p>
        }
    />
);
