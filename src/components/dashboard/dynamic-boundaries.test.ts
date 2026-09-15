import { describe, expect, it } from "bun:test";
import { relative, resolve } from "node:path";

const sourceRoot = resolve(import.meta.dir, "../..");

describe("deferred component boundaries", () => {
    it("keeps every dynamic import behind a local loading fallback", async () => {
        const uncovered: string[] = [];
        let dynamicImportCount = 0;

        for await (const path of new Bun.Glob("**/*.tsx").scan({
            cwd: sourceRoot,
            absolute: true,
        })) {
            const source = await Bun.file(path).text();
            const dynamicCalls = source.match(/\bdynamic\(/g)?.length ?? 0;
            if (dynamicCalls === 0) continue;

            dynamicImportCount += dynamicCalls;
            const localFallbacks = source.match(/\bloading:/g)?.length ?? 0;
            if (localFallbacks < dynamicCalls) {
                uncovered.push(relative(sourceRoot, path));
            }
        }

        expect(dynamicImportCount).toBe(8);
        expect(uncovered).toEqual([]);
    });
});
