export declare function serve(handler: (req: any) => Promise<any> | any): void;

declare global {
  const EdgeRuntime: {
    waitUntil(promise: Promise<unknown>): void;
  };

  namespace Deno {
    export const env: {
      get(name: string): string | undefined;
    };
  }
}
