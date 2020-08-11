import cheerio from 'cheerio';
import * as E from 'fp-ts/lib/Either';
import * as TE from 'fp-ts/lib/TaskEither';
import * as O from 'fp-ts/lib/Option';
import { sequenceT, sequenceS } from 'fp-ts/lib/Apply';
import { pipe } from 'fp-ts/lib/pipeable';
import Redis from 'ioredis';
import AWS from 'aws-sdk';
import moment from 'moment-timezone';

import {
  getEnv,
  httpGet,
  hashData,
  noopOnNull,
  parseInteger
} from './util';
import {
  ParsedCounterData,
  ParsedPageData,
  CaseData
} from './model';

function parseDataDate(info: string): E.Either<Error, string> {
  const date = (info.match(/(\d\d?\/\d\d?\/\d\d\d\d)/) || [])[1];
  const time = (info.match(/(\d\d?:\d\d.m)/)|| [])[1];
  const fromNullable = E.fromNullable(new Error('Parse failed.'));

  return pipe(
    sequenceT(E.either)(
      fromNullable(date),
      fromNullable(time)
    ),
    E.chain(([d, t]) =>
      E.tryCatch(
        () => moment(`${ d } ${ t }`, 'M/D/YYYY h:mm a').tz('US/Pacific').format(),
        err => err instanceof Error ? err : new Error('Unknown date error.')
      )
    )
  );
}

function sanitizeNumber(str: string): E.Either<Error, number> {
  return parseInteger(str.replace(/[^0-9]/g, ''));
}

function extractColumn($: CheerioStatic, rows: Cheerio, match: string): O.Option<string> {
  const text = rows.filter((i, e) => 
    $(e).children('td').first().text().toLowerCase().trim().includes(match)
  )
  .first()
  .children('td')
  .next()
  .text()
  .trim();

  return text ? O.some(text) : O.none;
}

function parsePageData(html: string): E.Either<Error, ParsedPageData> {
  const $ = cheerio.load(html);
  const rows = $('tr');

  return pipe(
    E.fromOption(() => new Error('Empty column.'))(
      extractColumn($, rows, 'hospitalized')
    ),
    E.chain(sanitizeNumber),
    E.map(totalHospitalized => ({ totalHospitalized }))
  );
}

function parseCounterItem(raw: string, property: string): O.Option<string> {
  const regex = RegExp(`"${ property }":\\s*"(.+?)",?`);
  const match = raw.match(regex);

  return O.fromNullable(match && match[1]);
}

function parseCounterData(data: string): E.Either<Error, ParsedCounterData> {
  const fromOption = E.fromOption(() => new Error('Property undefined.'));
  const toNumber = (opt: O.Option<string>) => pipe(
    fromOption(opt), 
    E.chain(sanitizeNumber)
  );

  return pipe(
    sequenceS(E.either)({
      totalCases: toNumber(parseCounterItem(data, 'count')),
      totalDeaths: toNumber(parseCounterItem(data, 'death')),
      dailyCases: toNumber(parseCounterItem(data, 'dailycount')),
      dailyDeath: toNumber(parseCounterItem(data, 'dailydeath')),
      update: fromOption(parseCounterItem(data, 'date')),
      info: fromOption(parseCounterItem(data, 'info'))
    }),
    E.chain(data => 
      pipe(
        parseDataDate(data.info),
        E.map(dataDate => ({
          ...data,
          dataDate
        }))
      )
    )
  );
}

function compareHash(redisClient: Redis.Redis, data: string): TE.TaskEither<Error | null, string> {

  return pipe(
    TE.fromTask(() => redisClient.get('case_hash')),
    TE.mapLeft(err => err instanceof Error ? err : new Error('Unknown Redis error.')),
    TE.chain(currentHash => {
      const hash = hashData(data);

      if (!currentHash || hash !== currentHash) {
        return TE.right(hash)
      }

      return TE.left(null);
    })
  );
}

function storeData(dynamoClient: AWS.DynamoDB.DocumentClient, data: CaseData): TE.TaskEither<Error, any> {

  return TE.fromTask(() => 
    dynamoClient.put({
      TableName: 'DailyCases',
      Item: data
    })
    .promise()
  );
}

function cacheHash(redisClient: Redis.Redis, hash: string): TE.TaskEither<Error, 'OK' | null> {
  return TE.fromTask(() => 
    redisClient.set('case_hash', hash)
  );
}

function scheduleTweet(lambdaClient: AWS.Lambda, data: CaseData): TE.TaskEither<Error, null> {
  // TODO
  // tslint:disable
  console.log(data);

  return pipe(
    TE.fromTask(() =>
      lambdaClient.invoke({
        FunctionName: 'la-covid-19-bot-dev-tweet',
        Payload: JSON.stringify({
          type: 'case',
          data
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
  PAGE_URL: string;
  COUNTER_URL: string;
  HTTP_TIMEOUT: number;
}

export default function run(env: Env, redisClient: Redis.Redis, dynamoClient: AWS.DynamoDB.DocumentClient, lambdaClient: AWS.Lambda): TE.TaskEither<Error, null> {
  return pipe(
    sequenceT(TE.taskEither)(
      httpGet(env.PAGE_URL, { timeout: env.HTTP_TIMEOUT }),
      httpGet(env.COUNTER_URL, { timeout: env.HTTP_TIMEOUT })
    ),
    TE.chainW(([pageResp, counterResp]) =>
      pipe(
        compareHash(redisClient, counterResp.data),
        TE.chainW(hash => 
          pipe(
             sequenceT(TE.taskEither)(
               TE.fromEither(parsePageData(pageResp.data)),
               TE.fromEither(parseCounterData(counterResp.data))
             ),
             TE.map(([p, c]) => ({ ...p, ...c, hash }))
          )
        )
      )
    ),
    TE.chainW(data => 
      pipe(
        sequenceT(TE.taskEither)(
          storeData(dynamoClient, data), 
          cacheHash(redisClient, data.hash)
        ),
        TE.chain(() => scheduleTweet(lambdaClient, data))
      )
    ),
    TE.orElse(noopOnNull)
  );
}