import { S3 } from "aws-sdk";
import { flatten } from "./functional";

export interface DistributionMap {
  [service: string]: {
    [platform: string]: S3.Object[];
  };
}

function ensureMap(map: DistributionMap, service: string, platform: string) {
  if (!map[service]) {
    map[service] = {};
  }
  if (!map[service][platform]) {
    map[service][platform] = [];
  }
  return map[service][platform];
}

export function asMap(objects: S3.Object[]): DistributionMap {
  const map: DistributionMap = {};
  if (!objects) {
    return map;
  }

  for (const o of objects) {
    if (!o.Key || !o.LastModified) {
      continue;
    }
    const parts = o.Key.split("/");
    if (parts.length !== 3) {
      continue;
    }
    const [service, platform] = parts;
    ensureMap(map, service, platform).push(o);
  }
  return map;
}

export function sortByLatest(a: S3.Object, b: S3.Object): number {
  return b.LastModified!.getTime() - a.LastModified!.getTime();
}

type DistributionsFilter = (
  objects: S3.Object[],
  service: string,
  platform: string
) => S3.Object[];

export function filterMap(
  map: DistributionMap,
  filter: DistributionsFilter
): DistributionMap {
  const newMap: DistributionMap = {};
  for (const service of Object.keys(map)) {
    for (const platform of Object.keys(map[service])) {
      const filtered = filter(map[service][platform], service, platform);
      if (filtered && filtered.length > 0) {
        Array.prototype.push.apply(
          ensureMap(newMap, service, platform),
          filtered
        );
      }
    }
  }
  return newMap;
}

export function flattenMap(map: DistributionMap): S3.Object[] {
  return flatten(
    flatten(
      Object.keys(map).map((service) =>
        Object.keys(map[service]).map((platform) => map[service][platform])
      )
    )
  );
}
