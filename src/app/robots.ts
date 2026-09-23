import type { MetadataRoute } from "next";

const robots = (): MetadataRoute.Robots => ({
    rules: {
        userAgent: "*",
        allow: "/",
        disallow: [
            "/api/",
            "/dashboard",
            "/oauth/",
            "/s/",
            "/dev/",
            "/__history-delete-preview",
        ],
    },
});
export default robots;
