import { ArrowLeft, Waypoints } from "lucide-react";

export function NotFoundPage() {
  return <main className="not-found"><Waypoints /><p className="eyebrow">404 / BROKEN DEPENDENCY</p><h1>This route is not in the plan.</h1><p>Return to the live THREAD workspace or inspect the WebMCP tool surface.</p><div><a className="primary-button" href="/"><ArrowLeft size={16} /> Open workspace</a><a className="secondary-button" href="/debug/webmcp">WebMCP debugger</a></div></main>;
}
