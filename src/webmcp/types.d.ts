export {};

declare global {
  interface WebMCPContent {
    type: "text";
    text: string;
  }

  interface WebMCPToolResult {
    content: WebMCPContent[];
    structuredContent?: unknown;
    isError?: boolean;
  }

  interface WebMCPToolDefinition {
    name: string;
    title?: string;
    description: string;
    inputSchema: Record<string, unknown>;
    annotations?: {
      readOnlyHint?: boolean;
      untrustedContentHint?: boolean;
    };
    execute(input: Record<string, unknown>): Promise<WebMCPToolResult>;
  }

  interface WebMCPRegisteredTool {
    name: string;
    title?: string;
    description: string;
    inputSchema: string | Record<string, unknown>;
    annotations?: Record<string, boolean>;
  }

  interface ModelContext {
    registerTool(tool: WebMCPToolDefinition, options?: { signal?: AbortSignal; exposedTo?: string[] }): Promise<void>;
    getTools(options?: { fromOrigins?: string[] }): Promise<WebMCPRegisteredTool[]>;
    ontoolchange: ((event: Event) => void) | null;
  }

  interface Document {
    readonly modelContext?: ModelContext;
  }
}
