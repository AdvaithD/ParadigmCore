# ParadigmCore (alpha)

![Status](https://img.shields.io/badge/status-alpha-orange.svg) ![Version](https://img.shields.io/badge/version-0.1.0x-brightgreen.svg)
[![AUR](https://img.shields.io/aur/license/yaourt.svg)](./LICENSE) [![Chat Server](https://img.shields.io/badge/chat%20server-join!-red.svg)](https://chat.paradigm.market/)

## Introduction
ParadigmCore is the main package that enables the functionality of the OrderStream network. Every OrderStream node in the network must be running ParadigmCore. To read more about the high-level functionality the package enables, check out the [WebSocket API](./docs/websocket-api.md) doc, and the Paradigm Protocol [whitepaper](https://paradigm.market/whitepaper). More documentation will be published soon.

This version of ParadigmCore (`blind-star`) is the direct Tendermint implementation of the OrderStream network node software. It is an [ABCI application](https://cosmos.network/docs/sdk/core/app4.html) intended to be used with the [Tendermint](https://github.com/tendermint/tendermint) BFT state replication software. 

ParadigmCore does not include a database (by default) or offer query functionality for historical orders. Instead it provides interfaces for common database solutions that can be used at the discretion of the node's host, depending on production environment. 

We have released one database interface so far, `ParadigmMongo`, that allows you to store all valid orders (as relayed via ParadigmCore's WS endpoint) in a MongoDB backend server running on your node, or another machine. The repository for `ParadigmMongo` can be found [here](https://github.com/paradigmfoundation/paradigmmongo). You can preview a live version of this software at https://zaidan.paradigm.market/. 

Valid orders are relayed via WebSocket protocol, by default from the following endpoint (this can be proxied to public or used by any application/middleware):
```
ws://localhost:4242/
```

## Download and Install Dependencies

First, make sure you have recent versions of Node.js, NPM, and TypeScript installed.
You should then clone this repository into a clean working directory. Something like `$HOME/paradigmcore`:

`git clone https://github.com/ParadigmFoundation/ParadigmCore`

From there, `cd paradigmcore` and install dependencies: `npm i`

## Build
This version is primarily implemented in TypeScript, and should be compiled to update the JS files in `./dist`. Modify `tsconfig.json` to the correct target for your environment, then run:
```
npm run build OR tsc
```
You can just run `tsc` if the default `tsconfig.json` is used.

## Run (this section is being updated)
UPDATE: Tendermint now runs in-process with ParadigmCore, you do not need to run a separate Tendermint node anymore.

To run, you must have a tendermint node runing on the same machine on the expected port. With tendermint's binary installed, run:
```
tendermint node
```
Assuming you have already configured the node with `tendermint init`, this will listen on the ABCI port. Then, start ParadigmCore with:
```
npm run start OR node ./dist/index.js
```
## Websocket API (valid order event stream)
see [`./docs/websocket-api.md`](./docs/websocket-api.md).

## HTTP API (propose an order)
This part will be expanded on soon. The primary interface endpoint (currently is) exposed as:
```
HTTP POST: localhost:4243
```
Where `request.body` is a JSON Paradigm order. This should be the primary point of contact with `ParadigmCore` for your application to post orders. The response from the server will tell you if the order was valid and accepted, and if so, the order hash (`OrderID`) that can be used to refrence it.

## Contributing

ParadigmCore is being developed as open-source software under a [GPL 3.0 License](./LICENSE). If you would like to get involved in the project, please feel free to do so by checking out the issues tab, creating issues, or forking the repository and making pull requests. We will be publishing formal contribution guidlines soon.

If you have any questions, please feel free to reach out to [Henry Harder](mailto:henry@paradigm.market) (GitHub @hrharder) the maintaner of this repository and project lead.
