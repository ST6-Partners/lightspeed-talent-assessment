declare module 'aws4' {
  interface SignOptions {
    host?: string; path?: string; service?: string; region?: string;
    method?: string; headers?: Record<string, string>; body?: string;
    [key: string]: any;
  }
  interface Credentials { accessKeyId: string; secretAccessKey: string; sessionToken?: string; }
  export function sign(opts: SignOptions, credentials?: Credentials): SignOptions;
  const aws4: { sign: typeof sign };
  export default aws4;
}
