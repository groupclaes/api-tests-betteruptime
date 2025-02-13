# ---- Build ----
FROM groupclaes/esbuild:v0.25.0 AS deps
WORKDIR /usr/src/app

COPY package.json ./package.json
COPY .npmrc ./.npmrc

RUN npm install --omit=dev --ignore-scripts

FROM groupclaes/node:22 AS release
USER node
WORKDIR /usr/src/app

COPY --from=deps /usr/src/app ./
COPY ./src ./

# command to run when intantiate an image
CMD ["node","./index.mjs"]