declare module 'aws-xray-sdk-core' {
  export function captureAWS<T>(awssdk: T): T;

  export function captureAWSClient<T>(service: T): T;
}
