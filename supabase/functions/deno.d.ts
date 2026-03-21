declare namespace Deno {
  export const env: {
    get(name: string): string | undefined;
  };
}

// Minimal shim for Deno's serve function and standard Web APIs in Deno context
declare function serve(handler: (req: Request) => Promise<Response> | Response): void;

// Add missing standard Web API properties if needed by the IDE
interface Request {
  readonly method: string;
  readonly url: string;
  readonly headers: Headers;
  json(): Promise<any>;
  text(): Promise<string>;
}

interface Response {
  readonly status: number;
  readonly headers: Headers;
}
