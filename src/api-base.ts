import * as awsTypes from 'aws-lambda';

interface IApiRequest<T> {
  body: T;
  headers: { [name: string]: string };
  pathParameters: { [name: string]: string };
  queryStringParameters: { [name: string]: string };
}

type ApiHandler<T> = (request: IApiRequest<T>) => any | Promise<any>;

export class ApiError extends Error {
  constructor(public message: string, public statusCode: number = 400) {
    super(message);
  }
}

export const api = <T>(handler: ApiHandler<T>) => (
  gatewayEvent: awsTypes.APIGatewayEvent,
  _: awsTypes.Context,
  callback: awsTypes.Callback,
) => {
  const response = (value: any, statusCode: number = 200) =>
    callback(null, {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: JSON.stringify(value),
    });
  const error = (err: Error, statusCode: number = 500) =>
    err instanceof ApiError
      ? response(err.message, err.statusCode)
      : response(err.message || 'Server has encountered an error.', statusCode);

  try {
    const request = {
      body: JSON.parse(gatewayEvent.body || '{}') as T,
      headers: gatewayEvent.headers,
      pathParameters: gatewayEvent.pathParameters || {},
      queryStringParameters: gatewayEvent.queryStringParameters || {},
    };
    const result = handler(request);
    if (result && result instanceof Promise) {
      return result.then(response).catch(error);
    } else {
      return response(result);
    }
  } catch (err) {
    return error(err);
  }
};
