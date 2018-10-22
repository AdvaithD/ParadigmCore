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

import * as Paradigm from "paradigm-connect";
import * as abci from "abci";

import { PayloadCipher } from "../crypto/PayloadCipher";
import { Hasher } from "../crypto/Hasher";
import { Vote } from "../util/Vote"
import { Logger } from "../util/Logger";
import { OrderTracker } from "../async/OrderTracker";
import { EventEmitter } from "events";
//import { StakeRebalancer } from "../async/StakeRebalancer";

import { messages as msg } from "../util/messages";
import { 
    VERSION, ABCI_PORT, WEB3_PROVIDER, PERIOD_LENGTH, 
    PERIOD_LIMIT, STAKE_CONTRACT_ADDR, STAKE_CONTRACT_ABI, ABCI_HOST, ABCI_RPC_PORT 
} from "../config";

let Order = new Paradigm().Order;
let tracker: OrderTracker; // used to broadcast orders
//let rebalancer: StakeRebalancer; // construct and submit mapping
let state: any; // network rate-limit state
let handlers: object; // ABCI handler functions

/**
 * start (exported function): Initialize and start the ABCI application.
 * 
 * @param _state {object} initial network state
 * @param emitter {EventEmitter} emitter to attach to OrderTracker
 */
export async function startMain(_state: object, emitter: EventEmitter){
    try {
        state = _state;

        handlers = {
            info: info,
            beginBlock: beginBlock,
            checkTx: checkTx,
            deliverTx: deliverTx,
            commit: commit
        };

        tracker = new OrderTracker(emitter);

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

        await abci(handlers).listen(ABCI_PORT);
        Logger.consensus(msg.abci.messages.servStart);
        tracker.activate();

    } catch (err) {
      throw new Error('Error initializing ABCI application.');
    }
    return;
}

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

function info(_){
    return {
        data: 'ParadigmCore ABCI Application',
        version: VERSION,
        lastBlockHeight: 0,
        lastBlockAppHash: Buffer.alloc(0)
    }
}

function beginBlock(request){
    let currHeight = request.header.height;
    let currProposer = request.header.proposerAddress.toString('hex');

    // rebalancer.newOrderStreamBlock(currHeight, currProposer);

    Logger.newRound(currHeight, currProposer);
    return {};
}

function checkTx(request){
    let txObject;

    try {
      txObject = PayloadCipher.ABCIdecode(request.tx);
    } catch (error) {
      Logger.mempoolErr(msg.abci.errors.decompress);
      return Vote.invalid(msg.abci.errors.decompress);
    }

    if(txObject.type === "OrderBroadcast"){ 
      // TX type is OrderBroadcast

      try {
        let newOrder = new Order(txObject.data);
        let recoveredAddr = newOrder.recoverPoster().toLowerCase();

        //console.log(`(temporary) Recovered address: ${recoveredAddr}`);

        if (typeof(recoveredAddr) === 'string'){
          // if staker has an entry in state

          Logger.mempool(msg.abci.messages.mempool);
          return Vote.valid(Hasher.hashOrder(newOrder));
        } else {
          // no stake in mapping

          Logger.mempool(msg.abci.messages.noStake);
          return Vote.invalid(msg.abci.messages.noStake);
        }
      } catch (error) {
        // eror constructing order

        Logger.mempoolErr(msg.abci.errors.format);
        return Vote.invalid(msg.abci.errors.format);
      }
    } else {
      // Tx type doesn't match OrderBroadcast or Rebalance

      Logger.mempoolErr("Invalid transaction type rejected.");
      return Vote.invalid("Unknown transaction type.");
    }
}

function deliverTx(request){
    let txObject;
    
    try {
      txObject = PayloadCipher.ABCIdecode(request.tx);
    } catch (error) {
      Logger.consensusErr(msg.abci.errors.decompress)
      return Vote.invalid(msg.abci.errors.decompress);
    }


    if(txObject.type === "OrderBroadcast"){
      // TX type is OrderBroadcast
      
      try {      
        let newOrder = new Order(txObject.data);
        let recoveredAddr = newOrder.recoverPoster().toLowerCase();

        if (typeof(recoveredAddr) === 'string'){
          // Condition to see if poster has sufficient quota for order broadcast

          let dupOrder: any = newOrder.toJSON(); // create copy of order
          dupOrder.id = Hasher.hashOrder(newOrder); // append OrderID

          // Begin state modification
          // state.mapping[recoveredAddr].orderBroadcastLimit -= 1; // decrease quota by 1
          state.orderCounter += 1; // add 1 to total number of orders
          // End state modification

          tracker.add(dupOrder); // add order to queue for broadcast

          // Logger.consensus(`(Temporary log) Poster remaining quota:${state.mapping[recoveredAddr].orderBroadcastLimit}`);
    
          Logger.consensus(msg.abci.messages.verified);
          return Vote.valid(dupOrder.id);
        } else {
          // Poster does not have sufficient order quota

          Logger.consensus(msg.abci.messages.noStake)
          return Vote.invalid(msg.abci.messages.noStake);
        }

      } catch (error) {
        Logger.consensusErr(msg.abci.errors.format);
        return Vote.invalid(msg.abci.errors.format);
      }

    } else {
      // TX type does not match Rebalance or OrderBroadcast

      Logger.consensusErr("Invalid transaction type rejected.");
      return Vote.invalid("Invalid transaction type.");
    }
}

function commit(request){
  let stateHash: string; // stores the hash of current state

    try {
      tracker.triggerBroadcast(); // Broadcast orders in block via WS

      stateHash = Hasher.hashState(state); // generate the hash of the new state
      Logger.consensus(`Commit and broadcast complete. Current state hash: ${stateHash}`);
          
    } catch (err) {
      console.log(err); // temporary
      Logger.consensusErr("Error broadcasting orders (may require process termination).");
    }
    
    return stateHash; // "done" // change to something more meaningful
}