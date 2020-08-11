import AWS from 'aws-sdk';
import * as E from 'fp-ts/lib/Either';
import * as TE from 'fp-ts/lib/TaskEither';
import { pipe } from 'fp-ts/lib/pipeable';
import {
  HospitalizationRow,
  CaseData,
  HospitalizationTweetData,
  CaseTweetData,
  TweetData
} from './model';
import {
  noopOnNull
} from './util';
import formatHospitalTweet from './format-hospital-tweet';
import formatCaseTweet from './format-case-tweet';
import Twit from 'twit';

function isTweetSent(dynamoClient: AWS.DynamoDB.DocumentClient, hash: string): TE.TaskEither<Error, boolean> {
  
  return pipe(
    TE.fromTask(() => 
      dynamoClient.get({
        TableName: 'TweetStatus',
        Key: {
          hash
        }
      })
      .promise()
    ),
    TE.mapLeft(err => err instanceof Error ? err : new Error('Unknown DynamoDB error.')),
    TE.map(({ Item }) => !!Item)
  );
}

function markTweetAsSent(dynamoClient: AWS.DynamoDB.DocumentClient, text: string, tweetData: TweetData): TE.TaskEither<Error, any> {
  return TE.fromTask(() => 
    dynamoClient.put({
      TableName: 'TweetStatus',
      Item: {
        type: tweetData.type,
        createdAt: new Date().toISOString(),
        status: 'sent',
        hash: tweetData.data.hash,
        text,
        data: tweetData.data
      }
    })
    .promise()
  );
}

function formatStatus(tweetData: TweetData): E.Either<Error, string> {
  if (tweetData.type === 'hospital') {
    return formatHospitalTweet(tweetData.data.rows);
  } else if (tweetData.type === 'case') {
    return formatCaseTweet(tweetData.data);
  } else {
    return E.left(new Error('Unknown tweet type.'));
  }
}

function sendTweet(twitterClient: TwitterClient, text: string): TE.TaskEither<Error, null> {
  // TODO: SQS
  
  return pipe(
    TE.fromTask(() => twitterClient.post('/statuses/update', { status: text })),
    TE.mapLeft(err => err instanceof Error ? err : new Error('Unknown Twitter error.')),
    TE.map(() => null)
  );  
}

interface TwitterClient {
  post: (path: string, params: Twit.Params) => Promise<any>;
}

export default function run(twitterClient: TwitterClient, dynamoClient: AWS.DynamoDB.DocumentClient, tweetData: TweetData): TE.TaskEither<Error, null> {
  return pipe(
    isTweetSent(dynamoClient, tweetData.data.hash),
    TE.chainW(isSent => 
      isSent ? TE.left(null) : TE.right(isSent),
    ),
    TE.chainW(() => TE.fromEither(formatStatus(tweetData))),
    TE.chainW(text => 
      pipe(
        sendTweet(twitterClient, text),
        TE.chain(() => 
          markTweetAsSent(dynamoClient, text, tweetData)
        )
      )
    ),
    TE.orElse(noopOnNull)
  );
}