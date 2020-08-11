import AWS from 'aws-sdk'

const config = process.env.IS_OFFLINE ?
  {
    region: 'localhost',
    endpoint: 'http://0.0.0.0:8000',
    sslEnabled: false,
    accessKeyId: 'local',
    secretAccessKey: 'local'
  } :
  {};

export default new AWS.DynamoDB.DocumentClient(config);