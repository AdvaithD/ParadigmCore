/*
  =========================
  ParadigmCore: Blind Star
  index.ts @ {master}
  =========================

  @date_inital 12 September 2018
  @date_modified 19 October 2018
  @author Henry Harder

  Entry point and startup script for ParadigmCore. 
*/

import * as _ws from "ws";
import * as tendermint from "tendermint-node";

import { Logger } from "./util/Logger";
import { WebSocketMessage } from "./net/WebSocketMessage";
import { messages as msg } from "./util/messages";
import { EventEmitter } from "events";

import { state } from "./state/state";
import { startMain } from "./abci/handlers";
import { startAPIserver } from "./net/server";

import { WS_PORT, TM_HOME, ABCI_HOST, ABCI_RPC_PORT, API_PORT } from "./config";

let wss: _ws.Server;
let emitter: EventEmitter;
let node: any; // Tendermint node instance

/**
 * This function executes immediately upon this file being executed. It is
 * responsible for starting all dependant modules.
 */
(async function() {
    Logger.logStart();

    // Configure and start Tendermint core
    Logger.consensus("Starting Tendermint Core...");
    try {
        await tendermint.init(TM_HOME);
        node = tendermint.node(TM_HOME, {
            rpc: {
                laddr: `tcp://${ABCI_HOST}:${ABCI_RPC_PORT}`
            }
        });

        // node.stdout.pipe(process.stdout); // pipe tendermint logs to STDOUT

    } catch (error) {
        console.log(error);
        Logger.consensusErr("Fatal error starting Tendermint core.");
        process.exit();
    }

    // Start WebSocket server
    Logger.websocketEvt("Starting WebSocket server...");
    try {
        wss = new _ws.Server({ port: WS_PORT }, () => {
            Logger.websocketEvt(msg.websocket.messages.servStart);
        });
        emitter = new EventEmitter(); // parent event emitter
    } catch (error) {
        Logger.websocketErr("Fatal error starting WebSocket server.");
        process.exit();
    }

    // Start ABCI application
    try{
        // start main ParadigmCore logic 
        await startMain(state, emitter);
        Logger.consensus("Waiting for Tendermint to synchronize...");

        await node.synced();
        Logger.consensus("Tendermint initialized and syncronized.");

        // start state rebalancer sub-process AFTER sync
        // await startRebalancer();
        // Logger.rebalancer("Stake rebalancer activated. Subscribed to Ethereum events.", 0);
    } catch (error) {
        Logger.logError(msg.abci.errors.fatal);
        process.exit();
    }

    // Start HTTP API server
    try {
        Logger.apiEvt("Starting HTTP API server...");
        await startAPIserver(ABCI_HOST, ABCI_RPC_PORT, API_PORT);
    } catch (error) {
        Logger.apiErr(msg.api.errors.fatal)
        process.exit();
    }

    /**
     * Begin WebSocket handler implementation (below)
     * 
     * TODO: move this to another file
     */

    wss.on("connection", ws => {
        try {
            WebSocketMessage.sendMessage(ws, msg.websocket.messages.connected);
        } catch (err) {
            Logger.websocketErr(msg.websocket.errors.connect);
        }
    
        emitter.on("order", order => {
            try {
                wss.clients.forEach(client => {
                    if ((client.readyState === 1) && (client === ws)){
                        WebSocketMessage.sendOrder(client, order);
                    }
                });
            } catch (err) {
                Logger.websocketErr(msg.websocket.errors.broadcast);
            }
        });
        
        ws.on('message', message => {
            if(message === "close") { 
                return ws.close();
            } else {
                WebSocketMessage.sendMessage(ws, `Unknown command '${message}.'`);
            }
        });
    });

    Logger.logEvent("Initialization complete, begining new block production.");
})();