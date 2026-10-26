import { mkdirSync, copyFileSync } from "node:fs";
const target = "planner/static/swagger";
mkdirSync(target, { recursive: true });
for (const file of ["swagger-ui.css", "swagger-ui-bundle.js"])
  copyFileSync(`node_modules/swagger-ui-dist/${file}`, `${target}/${file}`);
console.log("Documentação OpenAPI preparada para uso local, sem CDN.");
