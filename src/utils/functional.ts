export const flatten = <T>(input: T[][]) =>
  (input || []).reduce((a, b) => a.concat(b), []);

export const unique = <T>(input: T[]) => Array.from(new Set(input));

export const skipK = (k: number) => (_: any, index: number) => index >= k;

export const takeK = (k: number) => (_: any, index: number) => index < k;
