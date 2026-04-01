export declare function serve(handler: (req: any) => Promise<any> | any): void;

declare global {
  namespace Deno {
    export const env: {
      get(name: string): string | undefined;
    };
  }
}
