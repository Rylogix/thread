import { ArrowRight, Braces, GitBranch, Gauge, ShieldCheck } from "lucide-react";
import { DEMO_PROMPT } from "../domain/seed";
import { useThread } from "../app/ThreadProvider";

export function Hero() {
  const { service } = useThread();
  const start = async () => { await service.resetDemo({ actor: "human" }); };
  const copyPrompt = async () => { await navigator.clipboard.writeText(DEMO_PROMPT); };
  return (
    <main className="hero-shell">
      <header className="hero-nav">
        <a className="brand" href="/" aria-label="THREAD home"><img src="/thread-mark.svg" alt="" /><span>THREAD</span></a>
        <a className="text-link" href="/debug/webmcp"><Braces size={16} /> WebMCP debugger</a>
      </header>
      <section className="hero-copy">
        <div>
          <p className="eyebrow"><span className="status-dot" /> OPENAI WEBMCP CHALLENGE</p>
          <h1>Turn chaos into a plan<br />you can actually finish.</h1>
          <p className="hero-lede">THREAD gives humans and agents the same structured reality: a live dependency graph, deterministic planning, and reproducible simulation.</p>
          <div className="hero-actions">
            <button className="primary-button hero-cta" data-testid="try-demo" onClick={() => void start()}>Try the Hackathon Demo <ArrowRight size={19} /></button>
            <button className="secondary-button" onClick={() => void copyPrompt()}>Copy agent prompt</button>
          </div>
          <p className="hero-note">No signup. No API key. A complete seeded workspace in one click.</p>
        </div>
        <div className="hero-graph" aria-label="Illustration of a live project dependency graph">
          <div className="hero-node node-a"><span>Architecture</span><b>Complete</b></div>
          <div className="hero-node node-b"><span>WebMCP tools</span><b>7h · Critical</b></div>
          <div className="hero-node node-c"><span>Testing</span><b>6h · At risk</b></div>
          <div className="hero-node node-d"><span>Deploy</span><b>3h</b></div>
          <svg viewBox="0 0 600 430" aria-hidden="true"><path d="M132 106 C210 106 190 200 272 200 M388 200 C454 200 430 322 494 322 M132 106 C260 106 300 80 388 80 M388 80 C470 80 438 322 494 322" /></svg>
          <div className="hero-metric"><small>FINISH PROBABILITY</small><strong>72%</strong><span>Live, seeded simulation</span></div>
        </div>
      </section>
      <section className="hero-features" aria-label="THREAD capabilities">
        <article><GitBranch /><div><b>Shared execution graph</b><span>Manual and agent actions call one service layer.</span></div></article>
        <article><Gauge /><div><b>Deterministic simulation</b><span>Critical path, conflicts, P80, P95, and bottlenecks.</span></div></article>
        <article><ShieldCheck /><div><b>Judge-proof fallback</b><span>D1 persistence with browser-local recovery.</span></div></article>
      </section>
    </main>
  );
}
