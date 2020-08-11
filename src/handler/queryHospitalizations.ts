import 'source-map-support/register';
import Lambda from 'aws-lambda';
import AWS from 'aws-sdk';
import dynamoClient from '../resource/dynamodb';
import lambdaClient from '../resource/lambda';
import IORedis from 'ioredis';
import Redis from '../resource/redis';
import queryHospital from '../query-hospital';
import {
  getEnv,
  parseInteger
} from '../util';
import { sequenceT } from 'fp-ts/lib/Apply';
import * as TE from 'fp-ts/lib/TaskEither';
import * as E from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/pipeable';

export const handle = async function (payload: any, context: Lambda.Context, callback: Lambda.Callback): Promise<void> {
  let redisClient: IORedis.Redis | undefined;

  try {
    
    await pipe(
      TE.fromEither(
         sequenceT(E.either)(
          getEnv('REDIS_HOST'),
          getEnv('REDIS_PORT'),
          getEnv('ODATA_URL'),
          pipe(getEnv('HTTP_TIMEOUT'), E.chain(parseInteger))
        )
      ),
      TE.chain(([REDIS_HOST, REDIS_PORT, ODATA_URL, HTTP_TIMEOUT]) => {
        redisClient = Redis({
          host: REDIS_HOST,
          port: REDIS_PORT
        });

        return queryHospital(
          { ODATA_URL, HTTP_TIMEOUT }, 
          redisClient, 
          dynamoClient, 
          lambdaClient
        );
      }),
      TE.getOrElse(err => () => Promise.reject(err))
    )();

    callback();

  } catch (err) {

    callback(err);

  } finally {

    if (redisClient) {
      await redisClient.disconnect();
    }

  }
}