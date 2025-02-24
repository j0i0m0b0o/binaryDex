const Web3 = require('web3');

// ----- DEX ABI -----
const contractAbi = [
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true,  "name": "depositId",            "type": "uint256" },
      { "indexed": false, "name": "settlerRewardDeposit", "type": "uint256" },
      { "indexed": false, "name": "requestTimestamp",     "type": "uint256" },
      { "indexed": false, "name": "waitTimeDeposit",      "type": "uint256" }
    ],
    "name": "newDeposit",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true,  "name": "withdrawId",           "type": "uint256" },
      { "indexed": false, "name": "settlerRewardDeposit", "type": "uint256" },
      { "indexed": false, "name": "requestTimestamp",     "type": "uint256" },
      { "indexed": false, "name": "waitTimeWithdraw",     "type": "uint256" }
    ],
    "name": "newWithdrawal",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "name": "settlerRewardOpen", "type": "uint256" },
      { "indexed": false, "name": "positionId",        "type": "uint256" }
    ],
    "name": "positionOpenRequest",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "name": "posId", "type": "uint256" }
    ],
    "name": "endPositionStarted",
    "type": "event"
  },

  // Functions
  {
    "constant": false,
    "inputs": [{ "name": "depositId", "type": "uint256" }],
    "name": "settleDepositor",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [{ "name": "withdrawId", "type": "uint256" }],
    "name": "settleWithdraw",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [{ "name": "posId", "type": "uint256" }],
    "name": "settleOpen",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [{ "name": "posId", "type": "uint256" }],
    "name": "finalizeEndPosition",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [{ "name": "posId", "type": "uint256" }],
    "name": "endPosition",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },

  // For reading positions, depositRequests, withdrawRequests, etc
  {
    "constant": true,
    "inputs": [{ "name": "", "type": "uint256" }],
    "name": "positions",
    "outputs": [
      { "name": "trader",               "type": "address" },
      { "name": "direction",            "type": "bool" },
      { "name": "sizeETH",              "type": "uint256" },
      { "name": "settlerRewardOpen",    "type": "uint256" },
      { "name": "settlerRewardClose",   "type": "uint256" },
      { "name": "settlerRewardClose2",  "type": "uint256" },
      { "name": "closeOracleFee",       "type": "uint256" },
      { "name": "openOracleId",         "type": "uint256" },
      { "name": "closeOracleId",        "type": "uint256" },
      { "name": "openPrice",            "type": "uint256" },
      { "name": "stateChangeTimestamp", "type": "uint256" },
      { "name": "expectedEndTime",      "type": "uint256" },
      { "name": "state",                "type": "uint8" }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },

  // Additional getters for depositRequests / withdrawRequests
  {
    "constant": true,
    "inputs": [{ "name": "", "type": "uint256" }],
    "name": "depositRequests",
    "outputs": [
      { "name": "user",            "type": "address" },
      { "name": "amountETH",       "type": "uint256" },
      { "name": "settlerReward",   "type": "uint256" },
      { "name": "requestTimestamp","type": "uint256" },
      { "name": "waitTime",        "type": "uint256" },
      { "name": "settled",         "type": "bool" },
      { "name": "cancelled",       "type": "bool" },
      { "name": "longestBetId",    "type": "uint256" }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [{ "name": "", "type": "uint256" }],
    "name": "withdrawRequests",
    "outputs": [
      { "name": "user",            "type": "address" },
      { "name": "shares",          "type": "uint256" },
      { "name": "settlerReward",   "type": "uint256" },
      { "name": "requestTimestamp","type": "uint256" },
      { "name": "waitTime",        "type": "uint256" },
      { "name": "settled",         "type": "bool" },
      { "name": "cancelled",       "type": "bool" },
      { "name": "longestBetId",    "type": "uint256" }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },

  {
    "constant": true,
    "inputs": [],
    "name": "nextPositionId",
    "outputs": [{ "name": "", "type": "uint256" }],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
];

// ----- Oracle ABI (only the ReportSettled event) -----
const oracleAbi = [
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true,  "name": "reportId",            "type": "uint256" },
      { "indexed": false, "name": "price",               "type": "uint256" },
      { "indexed": false, "name": "settlementTimestamp", "type": "uint256" }
    ],
    "name": "ReportSettled",
    "type": "event"
  }
];

const providerUrl = 'wss://arbitrum-one.publicnode.com';
const privateKey  = process.env.PRIVATE_KEY; // Must be set
if (!privateKey) {
  throw new Error('PRIVATE_KEY environment variable is not set');
}

// Addresses
const contractAddress = '0x3dBeaD4113ef6BeC532a3cB9A3Ca692Ba9239B3C'; // DEX
const oracleAddress   = '0x0dD4BE671009F039cEfc4a3AC25b68Ef2E40F111'; // Oracle

// Basic config
const delay = 1.5; // deposit/withdraw wait times

// Store which deposits/withdrawals are blocked by posId
const blockedDepositsByPosId   = {};
const blockedWithdrawalsByPosId= {};

let openOracleIdToPosId  = {};
let closeOracleIdToPosId = {};

// Exponential backoff for reconnect
let reconnectAttempt = 0;
let web3;
let contract;
let oracleContract;
let account;

// -------------- SCHEDULING LOGIC for endPosition -------------
async function scheduleEndPosition(web3Inst, contractInst, posId, user) {
  try {
    const EXTRA_DELAY_SEC = 4;
    const positionData    = await contractInst.methods.positions(posId).call();
    const expectedEnd     = parseInt(positionData.expectedEndTime, 10);
    if (!expectedEnd) {
      console.log(`Position ${posId} has no expectedEndTime. Aborting scheduleEndPosition.`);
      return;
    }
    const latestBlock = await web3Inst.eth.getBlock('latest');
    const currentTs   = parseInt(latestBlock.timestamp, 10);
    const timeLeft    = expectedEnd - currentTs;

    const timeUntil   = timeLeft > 0 ? timeLeft + EXTRA_DELAY_SEC : 0;
    if (timeUntil <= 0) {
      console.log(`endPosition for ${posId} can be called immediately (timeUntil <= 0).`);
      await endPositionNow(contractInst, posId, user);
    } else {
      console.log(`Scheduling endPosition(${posId}) in ${timeUntil} seconds (expectedEndTime=${expectedEnd}).`);
      setTimeout(async () => {
        await endPositionNow(contractInst, posId, user);
      }, timeUntil * 1000);
    }
  } catch (err) {
    console.error(`Error in scheduleEndPosition(${posId}):`, err.message);
  }
}

async function endPositionNow(contractInst, posId, user) {
  console.log(`Attempting endPosition(${posId})...`);
  try {
    // Estimate gas & bump
    const baseGas = await contractInst.methods.endPosition(posId).estimateGas({
      from: user
    });
    const finalGas = Math.floor(baseGas * 1.2);

    // Bump gas price ~10%
    const recommendedGasPrice = await web3.eth.getGasPrice();
    const bumpedGasPriceBN    = web3.utils.toBN(recommendedGasPrice).muln(110).divn(100);

    const receipt = await contractInst.methods.endPosition(posId).send({
      from: user,
      gas: finalGas,
      gasPrice: bumpedGasPriceBN.toString()
    });
    console.log(`endPosition(${posId}) success - Tx: ${receipt.transactionHash}`);

    // read positionData, set closeOracleId => closeOracleIdToPosId map
    const positionData = await contractInst.methods.positions(posId).call();
    const closeOracleId = positionData.closeOracleId;
    if (closeOracleId && closeOracleId !== '0') {
      closeOracleIdToPosId[closeOracleId] = posId;
      console.log(`Mapped closeOracleId ${closeOracleId} -> posId ${posId} after endPosition`);
    } else {
      console.warn(`No closeOracleId found for posId=${posId} after endPosition`);
    }
  } catch (err) {
    console.error(`endPosition(${posId}) failed:`, err.message);
  }
}

// -------------- Helper to schedule deposit settle -------------
function scheduleSettleDepositor(depositId, waitTime) {
  const baseDelay = parseInt(2,10) + delay;
  const waitMs    = baseDelay * 1000;
  console.log(`Scheduling deposit ${depositId} in ~${baseDelay}s...`);
  setTimeout(async () => {
    try {
      const receipt = await sendTransactionDynamically(
        contract.methods.settleDepositor(depositId)
      );
      console.log(`Settled deposit ${depositId} - Tx: ${receipt.transactionHash}`);
    } catch (err) {
      console.error(`Error settling deposit ${depositId}:`, err.message);
    }
  }, waitMs);
}

// -------------- Helper to schedule withdraw settle -------------
function scheduleSettleWithdraw(withdrawId, waitTime) {
  const baseDelay = parseInt(2, 10) + delay;
  const waitMs    = baseDelay * 1000;
  console.log(`Scheduling withdraw ${withdrawId} in ~${baseDelay}s...`);
  setTimeout(async () => {
    try {
      const receipt = await sendTransactionDynamically(
        contract.methods.settleWithdraw(withdrawId)
      );
      console.log(`Settled withdrawal ${withdrawId} - Tx: ${receipt.transactionHash}`);
    } catch (err) {
      console.error(`Error settling withdrawal ${withdrawId}:`, err.message);
    }
  }, waitMs);
}

// -------------- RECONNECT / INITIALIZE -------------
function initializeWeb3() {
  console.log('Initializing Web3, attempt:', reconnectAttempt);

  // remove old listeners if any
  if (web3 && web3.currentProvider) {
    try {
      web3.currentProvider.removeAllListeners();
    } catch (e) {
      console.error("Error removing old listeners:", e.message);
    }
  }

  // create new WS
  const provider = new Web3.providers.WebsocketProvider(providerUrl, {
    reconnect: { auto: false }
  });
  web3 = new Web3(provider);

  web3.eth.accounts.wallet.add(privateKey);
  account = web3.eth.accounts.wallet[0].address;

  contract       = new web3.eth.Contract(contractAbi, contractAddress);
  oracleContract = new web3.eth.Contract(oracleAbi, oracleAddress);

  provider.on('connect', () => {
    reconnectAttempt = 0;
    console.log('WebSocket connected to Arbitrum');
  });
  provider.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
  provider.on('end', () => {
    console.log('WebSocket disconnected - will attempt reconnection...');
    attemptReconnect();
  });
  provider.on('close', () => {
    console.log('WebSocket closed - will attempt reconnection...');
    attemptReconnect();
  });

  attachEventListeners();
}

// -------------- RECONNECT HANDLER -------------
function attemptReconnect() {
  reconnectAttempt++;
  const backoffSec = Math.min(30, 2 ** reconnectAttempt);
  console.log(`Reconnection attempt #${reconnectAttempt} in ${backoffSec} sec...`);
  setTimeout(() => {
    initializeWeb3();
  }, backoffSec * 1000);
}

// -------------- DYNAMIC TX SENDER -------------
async function sendTransactionDynamically(methodCall) {
  const baseGas = await methodCall.estimateGas({ from: account });
  const finalGas = Math.floor(baseGas * 1.2);
  const recommendedGasPrice = await web3.eth.getGasPrice();
  const bumpedGasPriceBN    = web3.utils.toBN(recommendedGasPrice).muln(110).divn(100);
  return methodCall.send({
    from: account,
    gas: finalGas,
    gasPrice: bumpedGasPriceBN.toString()
  });
}

// -------------- EVENT LISTENERS -------------
function attachEventListeners() {

  // newDeposit
  contract.events.newDeposit({ fromBlock: 'latest' }, async (error, event) => {
    if (error) {
      console.error('Error on newDeposit event:', error);
      return;
    }
    const { depositId, waitTimeDeposit } = event.returnValues;
    console.log(`New deposit #${depositId}, newDeposit event fired.`);

    // read depositRequests to see if blocked
    try {
      const d = await contract.methods.depositRequests(depositId).call();
      const lPosId = d.longestBetId;  // lPosId is blocking pos
      if (lPosId === "0") {
        // no blocking pos => schedule normally
        scheduleSettleDepositor(depositId, waitTimeDeposit);
      } else {
        // Check if the position is already finalized
        const pos = await contract.methods.positions(lPosId).call();
        if (parseInt(pos.state, 10) === 4) { // Assuming 4 is Closed
          console.log(`Position ${lPosId} is already Closed, scheduling deposit ${depositId} immediately.`);
          scheduleSettleDepositor(depositId, waitTimeDeposit);
        } else {
          console.log(`Deposit ${depositId} is blocked by posId=${lPosId} - waiting for finalizeEndPosition.`);
          blockedDepositsByPosId[lPosId] = blockedDepositsByPosId[lPosId] || [];
          blockedDepositsByPosId[lPosId].push({ depositId, waitTime: waitTimeDeposit });
        }
      }
    } catch (err2) {
      console.error(`Could not read depositRequests(${depositId}):`, err2.message);
    }
  });

  // newWithdrawal
  contract.events.newWithdrawal({ fromBlock: 'latest' }, async (error, event) => {
    if (error) {
      console.error('Error on newWithdrawal event:', error);
      return;
    }
    const { withdrawId, waitTimeWithdraw } = event.returnValues;
    console.log(`New withdrawal #${withdrawId}, newWithdrawal event fired.`);

    // read withdrawRequests to see if blocked
    try {
      const w = await contract.methods.withdrawRequests(withdrawId).call();
      const lPosId = w.longestBetId;
      if (lPosId === "0") {
        scheduleSettleWithdraw(withdrawId, waitTimeWithdraw);
      } else {
        // Check if the position is already finalized
        const pos = await contract.methods.positions(lPosId).call();
        if (parseInt(pos.state, 10) === 4) { // Assuming 4 is Closed
          console.log(`Position ${lPosId} is already Closed, scheduling withdrawal ${withdrawId} immediately.`);
          scheduleSettleWithdraw(withdrawId, waitTimeWithdraw);
        } else {
          console.log(`Withdrawal ${withdrawId} is blocked by posId=${lPosId} - waiting for finalizeEndPosition.`);
          blockedWithdrawalsByPosId[lPosId] = blockedWithdrawalsByPosId[lPosId] || [];
          blockedWithdrawalsByPosId[lPosId].push({ withdrawId, waitTime: waitTimeWithdraw });
        }
      }
    } catch (err2) {
      console.error(`Could not read withdrawRequests(${withdrawId}):`, err2.message);
    }
  });

  // positionOpenRequest
  contract.events.positionOpenRequest({ fromBlock: 'latest' }, async (error, event) => {
    if (error) {
      console.error('Error on positionOpenRequest event:', error);
      return;
    }
    const { positionId } = event.returnValues;
    console.log(`positionOpenRequest for posId=${positionId}`);
    try {
      const pos = await contract.methods.positions(positionId).call();
      const openOracleId = pos.openOracleId;
      openOracleIdToPosId[openOracleId] = positionId;
      console.log(`Mapped openOracleId ${openOracleId} -> posId ${positionId}`);
    } catch (err) {
      console.error(`Error reading position ${positionId}:`, err.message);
    }
  });

  // endPositionStarted
  contract.events.endPositionStarted({ fromBlock: 'latest' }, async (error, event) => {
    if (error) {
      console.error('Error on endPositionStarted event:', error);
      return;
    }
    const { posId } = event.returnValues;
    console.log(`endPositionStarted for posId=${posId}`);
    try {
      const pos = await contract.methods.positions(posId).call();
      const closeOracleId = pos.closeOracleId;
      closeOracleIdToPosId[closeOracleId] = posId;
      console.log(`Mapped closeOracleId ${closeOracleId} -> posId ${posId}`);
    } catch (err) {
      console.error(`Error reading position ${posId}:`, err.message);
    }
  });

  // Oracle: ReportSettled
  oracleContract.events.ReportSettled({ fromBlock: 'latest' }, async (error, event) => {
    if (error) {
      console.error('Error on ReportSettled event:', error);
      return;
    }
    const { reportId } = event.returnValues;
    console.log(`Oracle settled reportId=${reportId}. Checking if it's open or close...`);

    // open oracle -> settleOpen
    if (openOracleIdToPosId[reportId]) {
      const posId = openOracleIdToPosId[reportId];
      console.log(`Found openOracleId->posId=${posId}, calling settleOpen(${posId})...`);
      try {
        const methodCall = contract.methods.settleOpen(posId);
        const baseGas    = await methodCall.estimateGas({ from: account });
        const finalGas   = Math.floor(baseGas * 1.2);
        const recommendedGasPrice = await web3.eth.getGasPrice();
        const bumpedGasPriceBN    = web3.utils.toBN(recommendedGasPrice).muln(110).divn(100);

        const receipt = await methodCall.send({
          from: account,
          gas: finalGas,
          gasPrice: bumpedGasPriceBN.toString()
        });
        console.log(`Settled open for posId=${posId} - Tx: ${receipt.transactionHash}`);

        await scheduleEndPosition(web3, contract, posId, account);
        delete openOracleIdToPosId[reportId];
      } catch (err) {
        console.error(`Error in settleOpen(${posId}):`, err.message);
      }
    }
    // close oracle -> finalizeEndPosition
    else if (closeOracleIdToPosId[reportId]) {
      const posId = closeOracleIdToPosId[reportId];
      console.log(`Found closeOracleId->posId=${posId}, calling finalizeEndPosition(${posId})...`);
      try {
        const methodCall = contract.methods.finalizeEndPosition(posId);
        const baseGas    = await methodCall.estimateGas({ from: account });
        const finalGas   = Math.floor(baseGas * 1.2);
        const recommendedGasPrice = await web3.eth.getGasPrice();
        const bumpedGasPriceBN    = web3.utils.toBN(recommendedGasPrice).muln(110).divn(100);

        const receipt = await methodCall.send({
          from: account,
          gas: finalGas,
          gasPrice: bumpedGasPriceBN.toString()
        });
        console.log(`Finalized end for posId=${posId} - Tx: ${receipt.transactionHash}`);

        // If deposits or withdrawals were blocked by this posId, schedule them now:
        if (blockedDepositsByPosId[posId]) {
          console.log(`Unblocking ${blockedDepositsByPosId[posId].length} deposit(s) for posId=${posId}.`);
          for (const dObj of blockedDepositsByPosId[posId]) {
            scheduleSettleDepositor(dObj.depositId, dObj.waitTime);
          }
          delete blockedDepositsByPosId[posId];
        }
        if (blockedWithdrawalsByPosId[posId]) {
          console.log(`Unblocking ${blockedWithdrawalsByPosId[posId].length} withdraw(s) for posId=${posId}.`);
          for (const wObj of blockedWithdrawalsByPosId[posId]) {
            scheduleSettleWithdraw(wObj.withdrawId, wObj.waitTime);
          }
          delete blockedWithdrawalsByPosId[posId];
        }

        delete closeOracleIdToPosId[reportId];
      } catch (err) {
        console.error(`Error in finalizeEndPosition(${posId}):`, err.message);
      }
    } else {
      console.log(`No mapping found for reportId=${reportId}, checking on-chain...`);
      try {
        const nextPosId = await contract.methods.nextPositionId().call();
        for (let i = 1; i < nextPosId; i++) {
          const pos = await contract.methods.positions(i).call();
          if (pos.closeOracleId === reportId && parseInt(pos.state, 10) === 3) { // WaitingCloseOracle
            console.log(`Found posId=${i} with closeOracleId=${reportId}, calling finalizeEndPosition(${i})...`);
            const methodCall = contract.methods.finalizeEndPosition(i);
            const baseGas = await methodCall.estimateGas({ from: account });
            const finalGas = Math.floor(baseGas * 1.2);
            const recommendedGasPrice = await web3.eth.getGasPrice();
            const bumpedGasPriceBN = web3.utils.toBN(recommendedGasPrice).muln(110).divn(100);
            const receipt = await methodCall.send({
              from: account,
              gas: finalGas,
              gasPrice: bumpedGasPriceBN.toString()
            });
            console.log(`Finalized end for posId=${i} - Tx: ${receipt.transactionHash}`);

            // unblocking if needed
            if (blockedDepositsByPosId[i]) {
              console.log(`Unblocking ${blockedDepositsByPosId[i].length} deposit(s) for posId=${i}.`);
              for (const dObj of blockedDepositsByPosId[i]) {
                scheduleSettleDepositor(dObj.depositId, dObj.waitTime);
              }
              delete blockedDepositsByPosId[i];
            }
            if (blockedWithdrawalsByPosId[i]) {
              console.log(`Unblocking ${blockedWithdrawalsByPosId[i].length} withdraw(s) for posId=${i}.`);
              for (const wObj of blockedWithdrawalsByPosId[i]) {
                scheduleSettleWithdraw(wObj.withdrawId, wObj.waitTime);
              }
              delete blockedWithdrawalsByPosId[i];
            }

            closeOracleIdToPosId[reportId] = i;
            break;
          }
        }
      } catch (err) {
        console.error(`Error checking on-chain for reportId=${reportId}:`, err.message);
      }
    }
  });
}

// -------------- MAIN -------------
async function main() {
  initializeWeb3();
  console.log('Settler bot started, listening for events on Arbitrum...');

  // KeepAlive / liveness
  setInterval(async () => {
    if (!web3) return;
    try {
      await web3.eth.getBlockNumber();
    } catch (err) {
      console.error('Keep-alive check failed:', err);
    }
  }, 30000);

  // Prevent exit
  setInterval(() => {
    // no-op
  }, 60000);

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
}

main().catch((error) => {
  console.error('Bot failed to start:', error);
  process.exit(1);
});
