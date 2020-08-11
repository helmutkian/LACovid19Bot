FROM node:12

RUN apt-get update \
    && apt-get install -y default-jre

WORKDIR /usr/app
COPY package.json ./
COPY .env* ./
COPY . .
RUN npm install -g serverless && npm install
RUN sls plugin install --name serverless-dynamodb-local 
RUN sls dynamodb install