// Copies the extension next to the shared stats.js into dist-extension/, ready for "Load unpacked" or zipping.
import { cpSync, rmSync } from "node:fs";

rmSync("dist-extension", { recursive: true, force: true });
cpSync("extension", "dist-extension", { recursive: true, filter: (f) => !f.endsWith("build.js") });
cpSync("stats.js", "dist-extension/stats.js");
console.log("Built dist-extension/");
