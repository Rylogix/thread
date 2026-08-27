import { AlertCircle, ArrowLeft, Bot, CheckCircle2, FlaskConical, Play, RefreshCw, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { useThread } from "../app/ThreadProvider";
import { buildThreadTools, executeThreadTool, THREAD_TOOL_COUNT, type ThreadToolDefinition } from "../webmcp/registerTools";

interface DebugResult { label: string; ok: boolean; detail: unknown }

export function DebugPage() {
  const { service, state, registration } = useThread();
  const tools = useMemo(() => buildThreadTools(service), [service]);
  const [results, setResults] = useState<DebugResult[]>([]);
  const [running, setRunning] = useState(false);
  const supported = registration?.supported ?? Boolean(document.modelContext);
  const run = async (kind: "read" | "mutation" | "full") => {
    setRunning(true);
    const next: DebugResult[] = [];
    try {
      if (!service.getState()) await service.resetDemo({ actor: "system" });
      if (kind === "read" || kind === "full") {
        for (const name of ["get_workspace", "get_tasks", "calculate_critical_path", "detect_conflicts"]) {
          const output = await executeThreadTool(service, name);
          next.push({ label: name, ok: !output.isError, detail: output.structuredContent ?? output.content });
        }
      }
      if (kind === "mutation" || kind === "full") {
        const created = await executeThreadTool(service, "create_task", { title: "WebMCP debug probe", estimatedHours: 1, priority: "low", idempotencyKey: "debug-probe" });
        next.push({ label: "create_task", ok: !created.isError, detail: created.structuredContent ?? created.content });
        const task = created.structuredContent as { id?: string } | undefined;
        if (task?.id) {
          const updated = await executeThreadTool(service, "update_task", { taskId: task.id, confidence: 0.95 });
          next.push({ label: "update_task", ok: !updated.isError, detail: updated.structuredContent ?? updated.content });
        }
        const simulation = await executeThreadTool(service, "run_simulation", { iterations: 100, seed: 20_260_903 });
        next.push({ label: "run_simulation", ok: !simulation.isError, detail: simulation.structuredContent ?? simulation.content });
      }
      if (kind === "full") {
        const malformed = await executeThreadTool(service, "create_task", { estimatedHours: -4 });
        next.push({ label: "malformed input rejected", ok: malformed.isError === true, detail: malformed.content });
        next.push({ label: "tool names unique", ok: new Set(tools.map((tool) => tool.name)).size === THREAD_TOOL_COUNT, detail: `${tools.length} definitions` });
        next.push({ label: "native discovery", ok: !supported || (registration?.nativeTools.length ?? 0) > 0, detail: supported ? registration?.nativeTools : "Unsupported browser: feature detection passed" });
      }
    } catch (error) {
      next.push({ label: "debug runner", ok: false, detail: error instanceof Error ? error.message : String(error) });
    } finally {
      setResults(next);
      setRunning(false);
    }
  };
  const grouped = tools.reduce<Record<string, ThreadToolDefinition[]>>((groups, tool) => { (groups[tool.category] ??= []).push(tool); return groups; }, {});
  return (
    <main className="debug-shell">
      <header className="debug-nav"><a className="brand" href="/"><img src="/thread-mark.svg" alt="" /><span>THREAD</span></a><a className="text-link" href="/"><ArrowLeft size={15} /> Back to workspace</a></header>
      <section className="debug-hero"><div><p className="eyebrow">WEBMCP TEST CONSOLE</p><h1>The agent surface,<br />made inspectable.</h1><p>Verify discovery, strict schemas, real state operations, malformed-input handling, and the no-support fallback.</p></div><div className={`support-card ${supported ? "supported" : "unsupported"}`}><span>{supported ? <CheckCircle2 /> : <AlertCircle />}</span><div><small>WEBMCP</small><strong>{supported ? "Supported" : "Not available"}</strong><p>{supported ? `${registration?.registered.length ?? 0} native tools registered` : "Manual planning works. Open in ChatGPT desktop or a WebMCP-enabled browser for agent tools."}</p></div></div></section>
      <section className="debug-summary"><div><span>PLANNED TOOLS</span><strong data-testid="tool-count">{THREAD_TOOL_COUNT}</strong></div><div><span>NATIVE DISCOVERED</span><strong>{registration?.nativeTools.length ?? 0}</strong></div><div><span>REGISTRATION ERRORS</span><strong>{registration?.errors.length ?? 0}</strong></div><div><span>WORKSPACE</span><strong>{state ? "Ready" : "Not loaded"}</strong></div></section>
      <section className="debug-controls"><button disabled={running} onClick={() => void run("read")}><FlaskConical /> Test Read Tools</button><button disabled={running} onClick={() => void run("mutation")}><Bot /> Test Mutation Tools</button><button className="primary-button" data-testid="debug-full-test" disabled={running} onClick={() => void run("full")}><Play /> Run Full Test</button><button disabled={running} onClick={() => void service.resetDemo({ actor: "human" }).then(() => setResults([]))}><RotateCcw /> Reset Demo</button></section>
      {registration?.errors.length ? <section className="registration-errors" role="alert"><h2>Registration errors</h2>{registration.errors.map((error) => <p key={`${error.name}-${error.message}`}><b>{error.name}</b> {error.message}</p>)}</section> : null}
      {results.length > 0 && <section className="debug-results" aria-live="polite"><header><h2>Test results</h2><button className="icon-text-button" onClick={() => setResults([])}><RefreshCw size={14} /> Clear</button></header>{results.map((result) => <details key={result.label} open={!result.ok}><summary><span className={result.ok ? "test-pass" : "test-fail"}>{result.ok ? <CheckCircle2 /> : <AlertCircle />}</span>{result.label}</summary><pre>{JSON.stringify(result.detail, null, 2).slice(0, 5_000)}</pre></details>)}</section>}
      <section className="tool-catalog"><header><p className="panel-kicker">REGISTERED SURFACE</p><h2>Every tool calls the shared domain service.</h2></header>{Object.entries(grouped).map(([category, categoryTools]) => <div className="tool-group" key={category}><h3>{category}<span>{categoryTools.length}</span></h3><div>{categoryTools.map((tool) => <details key={tool.name}><summary><code>{tool.name}</code><span className={tool.annotations?.readOnlyHint ? "readonly-badge" : "mutation-badge"}>{tool.annotations?.readOnlyHint ? "read only" : "mutates"}</span></summary><p>{tool.description}</p><pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre></details>)}</div></div>)}</section>
    </main>
  );
}
