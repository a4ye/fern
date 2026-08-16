import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    experimental: {
        // Spreadsheet imports travel to a server action as the file itself, and
        // the rows travel back up to be written. Both are well past the 1 MB an
        // action carries by default. The importer refuses a file at 2 MB, so
        // this sits above that and the friendlier message is the one seen.
        serverActions: { bodySizeLimit: "4mb" },
    },
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "avatars.githubusercontent.com",
            },
        ],
    },
};

export default nextConfig;
