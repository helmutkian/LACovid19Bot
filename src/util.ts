import * as Axios from 'axios';
import * as E from 'fp-ts/lib/Either';
import * as TE from 'fp-ts/lib/TaskEither';
import crypto from 'crypto';

const axios = Axios.default;

export function parseInteger(str: string): E.Either<Error, number> {
  const parsed = parseInt(str, 10);

  return isNaN(parsed) ? E.left(new Error('Invalid integer.')) : E.right(parsed);
}

export function getEnv(envVar: string): E.Either<Error, string> {
  return E.fromNullable(
    new Error(`Env var ${ envVar } undefined`)
   )(process.env[envVar]);
}

export function hashData(data: string): string {
  const shasum = crypto.createHash('sha256');
  shasum.update(data);

  return shasum.digest('hex');
}

export function httpGet(url: string, options?: Record<string, any>): TE.TaskEither<Error, Axios.AxiosResponse> {
  return TE.tryCatch(
    () => axios.get(url, options),
    e => (e instanceof Error ? e : new Error('Unknown error.'))
  )
}

export function noopOnNull(left: Error | null): TE.TaskEither<Error, null> {
  return left === null ? 
    TE.right(null) :
    TE.left(left);
}