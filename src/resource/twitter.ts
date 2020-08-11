import Twit from 'twit';
import { IncomingMessage } from 'http';

export default (config: Twit.Options) => {
  if (process.env.IS_OFFLINE) {
    return {
      post: async (endpoint: string, params: Twit.Params): Promise<void> => {
        if (params.status) {
          // tslint:disable-next-line
          console.log(params.status);
        }
      }
    };
  } 
  
  return new Twit(config);
}