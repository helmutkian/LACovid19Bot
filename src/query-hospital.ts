import * as TE from 'fp-ts/lib/TaskEither';
import { sequenceT } from 'fp-ts/lib/Apply';
import { pipe } from 'fp-ts/lib/pipeable';
import AWS from 'aws-sdk';
import Redis from 'ioredis';
import {
  getEnv,
  httpGet,
  hashData,
  noopOnNull
} from './util';
import {
  HospitalizationRow
} from './model';

function queryData(odataUrl: string, timeout: string | number = 3000): TE.TaskEither<Error, HospitalizationRow[]> {
  const query = `
   SELECT * from "42d33765-20fd-44b8-a978-b083b7542225" 
   WHERE "county" ILIKE \'Los Angeles\' 
   AND "todays_date" IS NOT NULL ORDER BY "todays_date" DESC LIMIT 14
  `.replace(/\s/g, ' ');

  return pipe(
    httpGet(`${ odataUrl }?sql=${ query }`, { timeout }),
    TE.map(resp => resp.data?.result?.records || [])
  )
}

function compareHash(redisClient: Redis.Redis, data: any[]): TE.TaskEither<Error | null, string> {

  return pipe(
    TE.fromTask(() => redisClient.get('hospital_hash')),
    TE.mapLeft(err => err instanceof Error ? err : new Error('Unknown Redis error.')),
    TE.chain(currentHash => {
      const hash = hashData(JSON.stringify(data));

      if (!currentHash || hash !== currentHash) {
        return TE.right(hash)
      }

      return TE.left(null);
    })
  );
}

function storeData(dynamoClient: AWS.DynamoDB.DocumentClient, data: { data: any[], hash: string }): TE.TaskEither<Error, AWS.DynamoDB.DocumentClient.PutItemOutput> {
  const record = {
    date: data.data[0].todays_date,
    createdAt: new Date().toISOString(),
    data: data.data,
    hash: data.hash
  };

  return TE.fromTask(() => 
    dynamoClient.put({
      TableName: 'Hospitalizations',
      Item: record
    })
    .promise()
  );
}

function cacheHash(redisClient: Redis.Redis, hash: string): TE.TaskEither<Error, 'OK' | null> {

  return TE.fromTask(() => 
    redisClient.set('hospital_hash', hash)
  );
}

function scheduleTweet(lambdaClient: AWS.Lambda, hash: string, data: HospitalizationRow[]): TE.TaskEither<Error, null> {
  // TODO: SQS

  return pipe(
    TE.fromTask(() =>
      lambdaClient.invoke({
        FunctionName: 'la-covid-19-bot-dev-tweet',
        Payload: JSON.stringify({
          type: 'hospital',
          data: {
            rows: data,
            hash
          }
        }),
        InvocationType: 'Event'
      })
      .promise()
    ),
    TE.mapLeft(err => 
      err instanceof Error ? 
        err : 
        new Error('Unknown Lambda invocation error.')
    ),
    TE.map(() => null)
  );
}

interface Env {
  ODATA_URL: string;
  HTTP_TIMEOUT: number;
}

export default function run(env: Env, redisClient: Redis.Redis, dynamoClient: AWS.DynamoDB.DocumentClient, lambdaClient: AWS.Lambda): TE.TaskEither<Error, null> {

  return pipe(
    queryData(env.ODATA_URL, env.HTTP_TIMEOUT),
    TE.chainW(data => 
      pipe(
        compareHash(redisClient, data),
        TE.map(hash => ({ data, hash }))
      )
    ),
    TE.chainW(({ data, hash }) =>
      pipe(
        sequenceT(TE.taskEither)(
          storeData(dynamoClient, { data, hash }),
          cacheHash(redisClient, hash)
        ),
        TE.chain(() => scheduleTweet(lambdaClient, hash, data))
      )
    ),
    TE.orElse(noopOnNull)
  );
}