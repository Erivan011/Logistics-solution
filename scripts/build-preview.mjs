// A standalone read-only view of an actual, recorded solver execution.
import { readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { resolve } from "node:path";
const run = JSON.parse(readFileSync("docs/demo-result.json", "utf8"));
const code = await build({
  entryPoints: ["planner-ui/src/main.tsx"],
  bundle: true,
  format: "iife",
  minify: true,
  write: false,
  platform: "browser",
  jsx: "automatic",
  loader: { ".css": "empty" },
  define: { "process.env.NODE_ENV": '"production"' },
});
const source = code.outputFiles[0].text.replaceAll("</script", "<\\/script");
const bootstrap = `const recorded=${JSON.stringify(run).replaceAll("<", "\\u003c")}; window.fetch=async function(input,options={}) {const method=(options.method||'GET').toUpperCase();const pathname=new URL(String(input),location.href).pathname;let data;if(method==='GET'&&pathname==='/api/health')return new Response(JSON.stringify({authentication_required:true}),{headers:{'Content-Type':'application/json'}});else if(method==='GET'&&pathname==='/api/demo')data=recorded;else if(method==='GET'&&pathname==='/api/scenarios')data=[{id:'demo-sp',version:1,updated_at:recorded.created_at,scenario:recorded.scenario_snapshot}];else if(method==='GET'&&pathname==='/api/dispatches')data=[];else if(method==='GET'&&pathname==='/api/runs')data=[{id:recorded.id,scenario_id:'demo-sp',scenario_version:1,created_at:recorded.created_at,name:recorded.scenario_snapshot.name,metrics:recorded.result.plan.metrics}];else if(method==='GET'&&pathname==='/api/runs/'+recorded.id)data=recorded;else return new Response(JSON.stringify({detail:'Esta prévia é somente leitura. Execute o projeto completo para cadastrar e recalcular cenários.'}),{status:403,headers:{'Content-Type':'application/json'}});return new Response(JSON.stringify({data}),{headers:{'Content-Type':'application/json'}});};`;
const css = readFileSync("planner-ui/src/styles.css", "utf8");
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Logistics Intelligence · Prévia demonstrativa</title><style>${css}\n.preview-note{position:fixed;inset:0 0 auto;height:27px;display:flex;justify-content:center;align-items:center;background:#d6e6d7;color:#416b56;font:10px 'Segoe UI',sans-serif;z-index:80}.app-shell{padding-top:27px}.sidebar{top:27px}@media(max-width:760px){.preview-note{font-size:8px}.sidebar{position:static}.app-shell{padding-top:27px}}</style></head><body><div class="preview-note">PRÉVIA SOMENTE LEITURA · Resultado de uma execução real sobre dados fictícios · Para recalcular, execute o projeto completo</div><div id="root"></div><script>${bootstrap}</script><script>${source}</script></body></html>`;
const target = resolve(
  process.argv[2] || "docs/Logistics_Intelligence_Preview.html",
);
writeFileSync(target, html);
console.log(target);
