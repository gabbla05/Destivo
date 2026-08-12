// Minimal Deno/type shims for TypeScript in this workspace
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  [key: string]: any;
};

declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export function serve(handler: (req: any) => Promise<any> | any, options?: any): any;
  export default serve;
}

declare type Request = any;
declare class Response {
  constructor(body?: any, init?: any);
}
