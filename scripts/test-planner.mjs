import { spawnSync } from "node:child_process";
import { root, python } from "./python-runtime.mjs";
const result = spawnSync(python, ["-m", "pytest", "tests/planner", "-q"], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
