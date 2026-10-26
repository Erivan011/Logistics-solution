import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
export const root = fileURLToPath(new URL("../", import.meta.url));
const local = join(
  root,
  ".venv-planner",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
export const python =
  process.env.PLANNER_PYTHON ||
  (existsSync(local)
    ? local
    : process.platform === "win32"
      ? "python"
      : "python3");
