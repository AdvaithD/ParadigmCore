/*
  =========================
  ParadigmCore: Blind Star
  commitState.ts @ {master}
  =========================
  
  @date_inital 22 October 2018
  @date_modified 19 October 2018
  @author Henry Harder

  Object that represents the post-commit state of the OS node.
*/

export let commitState = {
  round: {
    number: 0,
    startsAt: 0,
    endsAt: 0
  },
  mappings: {
    balances: {},
    limits: {}
  },
  orderCounter: 0,
  lastBlockHeight: 0,
  lastBlockAppHash: Buffer.alloc(0)
}
