import Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

let mock: Redis.Redis | undefined;

export default (
  (...args: any[]) => {
    if (process.env.IS_OFFLINE) {
      if (!mock) {
        mock = new RedisMock() as Redis.Redis;
      }

      return mock;
    }

    return new Redis(...args);
  }
);