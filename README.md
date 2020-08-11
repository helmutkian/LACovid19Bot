# LACovid19 Bot

## About

LACovid19Bot gathers COVID-19 data from LA County Public Health and other public health agencies in order to Tweet daily figures concerning the COVID-19 outbreak in Los Angeles County.

Twitter: https://twitter.com/LACovid19Bot

## Test

The project is a serverless application running in AWS Lambda triggered by CloudWatch Events to check the data sources on a regular interval.

However for local development, the project can be run in a `serverless-offline` environment and directly triggered via HTTP. Storage (DB & cache) will be torn down each time the `serverless-offline` environment is stopped. **The local development environment will not send actual tweets.** Instead the content of the tweet will be echoed to the command line, such as the following:

```
COVID-19+ Hospitalizations
8/9/2020

Patients: 1524 (+ 468 suspected)
7d avg: 1629, ⬇14.7%*

ICU Patients: 490 (+ 59 suspected)
7d avg: 504, ⬇10.3%*

Avail ICU Beds: 819
7d avg: 851, ⬇5.3%*

* since 8/2
```

To run, ensure the Docker has access to the project folder and execute

````
docker-compose build
docker-compose up
````

This will build the project and bootstrap the `serverless-offline` environment. Once you see the following, the Functions are ready to execute:

````
offline: [HTTP] server ready: http://0.0.0.0:3000
````

They can be invoked `curl -X POST -H "Content-Type: application/json" -d "{}" $ENDPOINT`

Given the following values for `$ENDPOINT`

| Description      | Endpoint    | 
| :------------- | :----------: | 
|  Scrape daily cases | http://localhost:3000/dev/proxy/la-covid-19-bot-dev-scrape |
| Query hospitalization  | http://localhost:3000/dev/proxy/la-covid-19-bot-dev-query | 

## Behavior

The bot will compare the contents of each data source against their last updated state. If the contents have not changed, **this will result in a noop** and nothing will be tweeted. If the contents have changed, this will result in a newly tweeted report.
