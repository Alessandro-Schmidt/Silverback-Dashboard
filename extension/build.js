// Copies the extension next to the shared stats.js and crest.js into dist-extension/, ready for "Load unpacked" or zipping.
import { cpSync, rmSync } from "node:fs";

rmSync("dist-extension", { recursive: true, force: true });
cpSync("extension", "dist-extension", { recursive: true, filter: (f) => !f.endsWith("build.js") });
for (const f of ["stats.js", "crest.js"]) cpSync(f, `dist-extension/${f}`);
console.log("Built dist-extension/");
