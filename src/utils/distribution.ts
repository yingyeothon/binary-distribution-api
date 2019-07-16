import { S3 } from 'aws-sdk';
import { flatten } from './functional';

export interface IDistributionMap {
  [service: string]: {
    [platform: string]: S3.Object[];
  };
}

const ensureMap = (
  map: IDistributionMap,
  service: string,
  platform: string,
) => {
  if (!map[service]) {
    map[service] = {};
  }
  if (!map[service][platform]) {
    map[service][platform] = [];
  }
  return map[service][platform];
};

export const asMap = (objects: S3.Object[]): IDistributionMap => {
  const map: IDistributionMap = {};
  if (!objects) {
    return map;
  }

  for (const o of objects) {
    if (!o.Key || !o.LastModified) {
      continue;
    }
    const parts = o.Key.split('/');
    if (parts.length !== 3) {
      continue;
    }
    const [service, platform] = parts;
    ensureMap(map, service, platform).push(o);
  }
  return map;
};

export const sortByLatest = (a: S3.Object, b: S3.Object) =>
  b.LastModified!.getTime() - a.LastModified!.getTime();

type DistributionsFilter = (
  objects: S3.Object[],
  service: string,
  platform: string,
) => S3.Object[];

export const filterMap = (
  map: IDistributionMap,
  filter: DistributionsFilter,
): IDistributionMap => {
  const newMap: IDistributionMap = {};
  for (const service of Object.keys(map)) {
    for (const platform of Object.keys(map[service])) {
      const filtered = filter(map[service][platform], service, platform);
      if (filtered && filtered.length > 0) {
        Array.prototype.push.apply(
          ensureMap(newMap, service, platform),
          filtered,
        );
      }
    }
  }
  return newMap;
};

export const flattenMap = (map: IDistributionMap): S3.Object[] =>
  flatten(
    flatten(
      Object.keys(map).map(service =>
        Object.keys(map[service]).map(platform => map[service][platform]),
      ),
    ),
  );
