import { lazy, Suspense } from "react";
import { ThreadProvider, useThread } from "./app/ThreadProvider";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { Hero } from "./components/Hero";
import { NotFoundPage } from "./pages/NotFoundPage";

const DebugPage = lazy(async () => import("./pages/DebugPage").then((module) => ({ default: module.DebugPage })));
const Workspace = lazy(async () => import("./components/Workspace").then((module) => ({ default: module.Workspace })));

function Router() {
  const { state, loading } = useThread();
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/debug/webmcp") return <Suspense fallback={<main className="loading-screen"><img src="/thread-mark.svg" alt="" /><span>Loading WebMCP console...</span></main>}><DebugPage /></Suspense>;
  if (path !== "/") return <NotFoundPage />;
  if (loading) return <main className="loading-screen"><img src="/thread-mark.svg" alt="" /><span>Loading structured reality...</span></main>;
  return state ? <Suspense fallback={<main className="loading-screen"><img src="/thread-mark.svg" alt="" /><span>Opening live graph...</span></main>}><Workspace /></Suspense> : <Hero />;
}

export default function App() {
  return <ErrorBoundary><ThreadProvider><Router /></ThreadProvider></ErrorBoundary>;
}
