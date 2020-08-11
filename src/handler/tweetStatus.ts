import 'source-map-support/register';
import Lambda from 'aws-lambda';
import AWS from 'aws-sdk';
import dynamoClient from '../resource/dynamodb';
import Twitter from '../resource/twitter';
import tweetStatus from '../tweet-status';
import {
  getEnv
} from '../util';
import { sequenceT } from 'fp-ts/lib/Apply';
import * as TE from 'fp-ts/lib/TaskEither';
import * as E from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/pipeable';

export const handle = async function (payload: any, context: Lambda.Context, callback: Lambda.Callback): Promise<void> {

  try {
    
    await pipe(
      TE.fromEither(
         sequenceT(E.either)(
          getEnv('TWITTER_CONSUMER_KEY'),
          getEnv('TWITTER_CONSUMER_SECRET'),
          getEnv('TWITTER_ACCESS_TOKEN'),
          getEnv('TWITTER_TOKEN_SECRET')
        )
      ),
      TE.chain(([TWITTER_CONSUMER_KEY, TWITTER_CONSUMER_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_TOKEN_SECRET]) => {
        const twitterClient = Twitter({
          consumer_key: TWITTER_CONSUMER_KEY,
          consumer_secret: TWITTER_CONSUMER_SECRET,
          access_token: TWITTER_ACCESS_TOKEN,
          access_token_secret: TWITTER_TOKEN_SECRET,
          strictSSL: true
        });

        return tweetStatus(twitterClient, dynamoClient, payload);
      }),
      TE.getOrElse(err => () => Promise.reject(err))
    )();

    callback();

  } catch (err) {

    callback(err);

  } 
}
