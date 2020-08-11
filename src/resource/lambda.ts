import AWS from 'aws-sdk';

const config = process.env.IS_OFFLINE ?
  {
    region: 'localhost',
    endpoint: 'http://0.0.0.0:3002',
    accessKeyId: 'local',
    secretAccessKey: 'local'
  } :
  {};

export default new AWS.Lambda(config);