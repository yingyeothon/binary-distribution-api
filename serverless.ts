import type { AWS } from "@serverless/typescript";

const config: AWS = {
  service: "yyt-dist-api",
  frameworkVersion: "3",
  provider: {
    name: "aws",
    runtime: "nodejs14.x",
    region: "ap-northeast-2",
    stage: "prod",
    memorySize: 256,
    timeout: 5,
    tracing: {
      apiGateway: true,
      lambda: true,
    },
    environment: {
      DIST_CONFIG_TOKENS: process.env.DIST_CONFIG_TOKENS!,
      DIST_BUCKET: process.env.DIST_BUCKET!,
      DIST_DOMAIN: process.env.DIST_DOMAIN!,
      DIST_API_URL_PREFIX: process.env.DIST_API_URL_PREFIX!,
      JWT_SECRET_KEY: process.env.JWT_SECRET_KEY!,
    },
    iam: {
      role: {
        statements: [
          {
            Action: ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
            Effect: "Allow",
            Resource: `arn:aws:s3:::${process.env.DIST_BUCKET}/*`,
          },
          {
            Action: ["s3:ListBucket"],
            Effect: "Allow",
            Resource: `arn:aws:s3:::${process.env.DIST_BUCKET}`,
          },
          {
            Action: ["cloudfront:CreateInvalidation"],
            Effect: "Allow",
            Resource: {
              "Fn::Join": [
                ":",
                [
                  "arn:aws:cloudfront",
                  "",
                  { Ref: "AWS::AccountId" },
                  `distribution/${process.env.DIST_CF_ID}`,
                ],
              ],
            },
          },
        ],
      },
    },
    httpApi: {
      authorizers: {
        auth: {
          type: "request",
          functionName: "authorize",
          enableSimpleResponses: true,
          identitySource: ["$request.header.cookie"],
        },
      },
    },
  },
  functions: {
    authorize: {
      handler: "src/auth.handle",
    },
    createDistribution: {
      handler: "src/put.createDistribution",
      events: [
        {
          httpApi: {
            method: "put",
            path: "/{serviceName}/{platform}/{version}",
            authorizer: "auth",
          },
        },
      ],
    },
    deleteDistribution: {
      handler: "src/put.deleteDistribution",
      events: [
        {
          httpApi: {
            method: "delete",
            path: "/{serviceName}/{platform}/{version}",
            authorizer: "auth",
          },
        },
      ],
    },
    listAllDistributions: {
      handler: "src/get.listAllDistributions",
      timeout: 12,
      events: [
        {
          httpApi: {
            method: "get",
            path: "/{serviceName}",
            authorizer: "auth",
          },
        },
      ],
    },
    listPlatformDistributions: {
      handler: "src/get.listPlatformDistributions",
      timeout: 12,
      events: [
        {
          httpApi: {
            method: "get",
            path: "/{serviceName}/{platform}",
            authorizer: "auth",
          },
        },
      ],
    },
    getPlistForLatestIos: {
      handler: "src/get.getPlistForLatestIos",
      timeout: 12,
      events: [
        {
          httpApi: {
            method: "get",
            path: "/ios/{packageName}/{semver}/manifest.plist",
          },
        },
      ],
    },
    redirectToIosManifest: {
      handler: "src/get.redirectToIosManifest",
      timeout: 12,
      events: [
        {
          httpApi: {
            method: "get",
            path: "/ios-manifest/{packageName}/{semver}",
          },
        },
      ],
    },
    findExpiredDistributions: {
      handler: "src/batch.findExpiredDistributions",
      timeout: 12,
      events: [
        {
          httpApi: {
            method: "get",
            path: "/expiration",
          },
        },
      ],
    },
    deleteExpiredDistributions: {
      handler: "src/batch.deleteExpiredDistributions",
      memorySize: 512,
      timeout: 29,
      events: [
        {
          httpApi: {
            method: "delete",
            path: "/expiration",
          },
        },
        {
          schedule: {
            rate: ["cron(0 20 * * ? *)"],
          },
        },
      ],
    },
  },
  package: {
    individually: true,
  },
  plugins: [
    "serverless-webpack",
    "serverless-s3-local",
    "serverless-offline",
    "serverless-prune-plugin",
  ],
  custom: {
    prune: {
      automatic: true,
      number: 7,
    },
  },
};

export = config;
