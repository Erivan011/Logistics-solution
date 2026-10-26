import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { root, python } from "./python-runtime.mjs";
if (!existsSync(join(root, "planner-ui/dist/index.html"))) {
  console.error(
    "Interface ainda não compilada. Execute npm ci e npm run build:ui antes de iniciar.",
  );
  process.exit(1);
}
const child = spawn(
  python,
  [
    "-m",
    "uvicorn",
    "planner.api:app",
    "--host",
    process.env.HOST || "127.0.0.1",
    "--port",
    process.env.PORT || "8000",
  ],
  { cwd: root, env: process.env, stdio: "inherit" },
);
child.on("error", (error) => {
  console.error(
    `Não foi possível iniciar Python: ${error.message}. Siga o README para preparar .venv-planner.`,
  );
  process.exitCode = 1;
});
child.on("exit", (code) => (process.exitCode = code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
