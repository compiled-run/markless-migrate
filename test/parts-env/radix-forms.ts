export const MATCHERS: Readonly<Record<string, () => Promise<readonly ((value: string, formData: FormData) => boolean | Promise<boolean>)[]>>> = {};
