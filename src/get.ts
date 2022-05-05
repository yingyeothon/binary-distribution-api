import "source-map-support/register";

import { APIGatewayProxyHandler, APIGatewayProxyHandlerV2 } from "aws-lambda";
import { filterMap, sortByLatest } from "./utils/distribution";
import {
  traverseInService,
  traverseInServicePlatform,
} from "./utils/traversal";

import { BadRequest } from "./response";
import { S3 } from "aws-sdk";
import plist from "./utils/plist";
import { takeK } from "./utils/functional";

const domainName = process.env.DIST_DOMAIN!;
const downloadUrlBase = `https://${domainName}`;
const distApiUrlPrefix = process.env.DIST_API_URL_PREFIX!;
const maxDistributionCount = 100;

interface PlatformVersions {
  [platform: string]: Array<{ url: string; modified: string }>;
}

function asDownloadVersion(o: S3.Object) {
  return {
    url: `${downloadUrlBase}/${o.Key!}`,
    modified: o.LastModified!,
  };
}

export const listAllDistributions: APIGatewayProxyHandlerV2<unknown> = async (
  event
) => {
  const { serviceName: service } = event.pathParameters ?? {};
  if (!service) {
    return BadRequest;
  }

  const count = Math.max(
    1,
    +((event.queryStringParameters ?? {}).count || `${maxDistributionCount}`)
  );
  const map = await traverseInService({ service, count });
  const latest = filterMap(map, (objects) =>
    objects.sort(sortByLatest).filter(takeK(count))
  )[service];

  const platforms = Object.keys(latest)
    .map((platform) => ({
      platform,
      versions: latest[platform].map(asDownloadVersion),
    }))
    .reduce(
      (a, b) => Object.assign(a, { [b.platform]: b.versions }),
      {} as PlatformVersions
    );
  return {
    service,
    platforms,
  };
};

async function findPlatformDistributions(
  service: string,
  platform: string,
  count: number
) {
  const distributions = await traverseInServicePlatform({
    service,
    platform,
    count,
  });
  return {
    service,
    platform,
    versions: distributions
      .sort(sortByLatest)
      .filter(takeK(count))
      .map(asDownloadVersion)
      .map((o) => o.url),
  };
}

export const listPlatformDistributions: APIGatewayProxyHandlerV2<
  unknown
> = async (event) => {
  const { serviceName: service, platform } = event.pathParameters ?? {};
  const count = +(
    (event.queryStringParameters ?? {}).count || `${maxDistributionCount}`
  );
  if (!service || !platform) {
    return BadRequest;
  }
  return findPlatformDistributions(service, platform, count);
};

export const getPlistForLatestIos: APIGatewayProxyHandlerV2 = async (event) => {
  const { packageName, semver } = event.pathParameters ?? {};
  if (!packageName || !semver) {
    return BadRequest;
  }
  const service = packageName.split(".")[2];
  if (!service) {
    return BadRequest;
  }

  const projectName = service.charAt(0).toUpperCase() + service.substring(1);
  const distributions = await findPlatformDistributions(service, "ios", 1);
  if (distributions.versions.length === 0) {
    return { statusCode: 404, body: `No distribution for ${packageName}` };
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/xml",
    },
    body: plist({
      name: projectName,
      downloadUrl: distributions.versions[0],
      packageName,
      semver,
    }),
  };
};

export const redirectToIosManifest: APIGatewayProxyHandlerV2 = async (
  event
) => {
  const { packageName, semver }: { packageName?: string; semver?: string } =
    event.pathParameters || {};
  if (!packageName || !semver) {
    return BadRequest;
  }
  return {
    statusCode: 302,
    headers: {
      Location:
        "itms-services://?action=download-manifest&url=" +
        `${distApiUrlPrefix}/ios/${packageName}/${semver}/manifest.plist`,
    },
    body: "",
  };
};
