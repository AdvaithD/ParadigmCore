"use strict";
/*
  =========================
  ParadigmCore: Blind Star
  handlers.ts @ {rebalance-refactor}
  =========================

  @date_inital 16 September 2018
  @date_modified 19 October 2018
  @author Henry Harder

  ABCI handler functions and state-transition logic.
*/
Object.defineProperty(exports, "__esModule", { value: true });
const Paradigm = require("paradigm-connect");
const abci = require("abci");
const PayloadCipher_1 = require("../crypto/PayloadCipher");
const Hasher_1 = require("../crypto/Hasher");
const Vote_1 = require("../util/Vote");
const Logger_1 = require("../util/Logger");
const OrderTracker_1 = require("../async/OrderTracker");
//import { StakeRebalancer } from "../async/StakeRebalancer";
const messages_1 = require("../util/messages");
const config_1 = require("../config");
let Order = new Paradigm().Order;
let tracker; // used to broadcast orders
//let rebalancer: StakeRebalancer; // construct and submit mapping
let state; // network rate-limit state
let handlers; // ABCI handler functions
/**
 * start (exported function): Initialize and start the ABCI application.
 *
 * @param _state {object} initial network state
 * @param emitter {EventEmitter} emitter to attach to OrderTracker
 */
async function startMain(_state, emitter) {
    try {
        state = _state;
        handlers = {
            info: info,
            beginBlock: beginBlock,
            checkTx: checkTx,
            deliverTx: deliverTx,
            commit: commit
        };
        tracker = new OrderTracker_1.OrderTracker(emitter);
        // TODO: pass in options from index.ts
        /*
        rebalancer = await StakeRebalancer.create({
          provider: WEB3_PROVIDER,
          periodLength: PERIOD_LENGTH,
          periodLimit: PERIOD_LIMIT,
          stakeContractAddr: STAKE_CONTRACT_ADDR,
          stakeContractABI: STAKE_CONTRACT_ABI,
          tendermintRpcHost: ABCI_HOST,
          tendermintRpcPort: ABCI_RPC_PORT
        });*/
        await abci(handlers).listen(config_1.ABCI_PORT);
        Logger_1.Logger.consensus(messages_1.messages.abci.messages.servStart);
        tracker.activate();
    }
    catch (err) {
        throw new Error('Error initializing ABCI application.');
    }
    return;
}
exports.startMain = startMain;
/**
 * startRebalancer (export async function): Call after ABCI/Tendermint has synchronized
 
export async function startRebalancer() {
  try {
    rebalancer.start(); // start listening to Ethereum events
     // start tracking new orders
  } catch (err) {
    throw new Error("Error activating stake rebalancer.");
  }
  return;
}*/
function info(_) {
    return {
        data: 'ParadigmCore ABCI Application',
        version: config_1.VERSION,
        lastBlockHeight: 0,
        lastBlockAppHash: Buffer.alloc(0)
    };
}
function beginBlock(request) {
    let currHeight = request.header.height;
    let currProposer = request.header.proposerAddress.toString('hex');
    // rebalancer.newOrderStreamBlock(currHeight, currProposer);
    Logger_1.Logger.newRound(currHeight, currProposer);
    return {};
}
function checkTx(request) {
    let txObject;
    try {
        txObject = PayloadCipher_1.PayloadCipher.ABCIdecode(request.tx);
    }
    catch (error) {
        Logger_1.Logger.mempoolErr(messages_1.messages.abci.errors.decompress);
        return Vote_1.Vote.invalid(messages_1.messages.abci.errors.decompress);
    }
    if (txObject.type === "OrderBroadcast") {
        // TX type is OrderBroadcast
        try {
            let newOrder = new Order(txObject.data);
            let recoveredAddr = newOrder.recoverPoster().toLowerCase();
            //console.log(`(temporary) Recovered address: ${recoveredAddr}`);
            if (typeof (recoveredAddr) === 'string') {
                // if staker has an entry in state
                Logger_1.Logger.mempool(messages_1.messages.abci.messages.mempool);
                return Vote_1.Vote.valid(Hasher_1.Hasher.hashOrder(newOrder));
            }
            else {
                // no stake in mapping
                Logger_1.Logger.mempool(messages_1.messages.abci.messages.noStake);
                return Vote_1.Vote.invalid(messages_1.messages.abci.messages.noStake);
            }
        }
        catch (error) {
            // eror constructing order
            Logger_1.Logger.mempoolErr(messages_1.messages.abci.errors.format);
            return Vote_1.Vote.invalid(messages_1.messages.abci.errors.format);
        }
    }
    else {
        // Tx type doesn't match OrderBroadcast or Rebalance
        Logger_1.Logger.mempoolErr("Invalid transaction type rejected.");
        return Vote_1.Vote.invalid("Unknown transaction type.");
    }
}
function deliverTx(request) {
    let txObject;
    try {
        txObject = PayloadCipher_1.PayloadCipher.ABCIdecode(request.tx);
    }
    catch (error) {
        Logger_1.Logger.consensusErr(messages_1.messages.abci.errors.decompress);
        return Vote_1.Vote.invalid(messages_1.messages.abci.errors.decompress);
    }
    if (txObject.type === "OrderBroadcast") {
        // TX type is OrderBroadcast
        try {
            let newOrder = new Order(txObject.data);
            let recoveredAddr = newOrder.recoverPoster().toLowerCase();
            if (typeof (recoveredAddr) === 'string') {
                // Condition to see if poster has sufficient quota for order broadcast
                let dupOrder = newOrder.toJSON(); // create copy of order
                dupOrder.id = Hasher_1.Hasher.hashOrder(newOrder); // append OrderID
                // Begin state modification
                // state.mapping[recoveredAddr].orderBroadcastLimit -= 1; // decrease quota by 1
                state.orderCounter += 1; // add 1 to total number of orders
                // End state modification
                tracker.add(dupOrder); // add order to queue for broadcast
                // Logger.consensus(`(Temporary log) Poster remaining quota:${state.mapping[recoveredAddr].orderBroadcastLimit}`);
                Logger_1.Logger.consensus(messages_1.messages.abci.messages.verified);
                return Vote_1.Vote.valid(dupOrder.id);
            }
            else {
                // Poster does not have sufficient order quota
                Logger_1.Logger.consensus(messages_1.messages.abci.messages.noStake);
                return Vote_1.Vote.invalid(messages_1.messages.abci.messages.noStake);
            }
        }
        catch (error) {
            Logger_1.Logger.consensusErr(messages_1.messages.abci.errors.format);
            return Vote_1.Vote.invalid(messages_1.messages.abci.errors.format);
        }
    }
    else {
        // TX type does not match Rebalance or OrderBroadcast
        Logger_1.Logger.consensusErr("Invalid transaction type rejected.");
        return Vote_1.Vote.invalid("Invalid transaction type.");
    }
}
function commit(request) {
    let stateHash; // stores the hash of current state
    try {
        tracker.triggerBroadcast(); // Broadcast orders in block via WS
        stateHash = Hasher_1.Hasher.hashState(state); // generate the hash of the new state
        Logger_1.Logger.consensus(`Commit and broadcast complete. Current state hash: ${stateHash}`);
    }
    catch (err) {
        console.log(err); // temporary
        Logger_1.Logger.consensusErr("Error broadcasting orders (may require process termination).");
    }
    return stateHash; // "done" // change to something more meaningful
}
