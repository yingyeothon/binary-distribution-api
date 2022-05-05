export function flatten<T>(input: T[][]) {
  return (input || []).reduce((a, b) => a.concat(b), []);
}

export function unique<T>(input: T[]) {
  return Array.from(new Set(input));
}

export function skipK(k: number) {
  return function (_: any, index: number) {
    return index >= k;
  };
}

export function takeK(k: number) {
  return function (_: any, index: number) {
    return index < k;
  };
}
