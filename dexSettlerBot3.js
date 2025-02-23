const Web3 = require('web3');

// ----- DEX ABI -----
const contractAbi = [
  // -------------------------------------------------
  // Events we listen for
  // -------------------------------------------------
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

  // -------------------------------------------------
  // Functions we call
  // -------------------------------------------------
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

  // *** IMPORTANT: We also have "endPosition(posId)"
  {
    "constant": false,
    "inputs": [{ "name": "posId", "type": "uint256" }],
    "name": "endPosition",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },

  // -------------------------------------------------
  // Getter we use to read openOracleId/closeOracleId, etc
  // -------------------------------------------------
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

async function main() {
  // ----------------------------------
  // Configuration
  // ----------------------------------
  const providerUrl = 'wss://arbitrum-one.publicnode.com';
  const privateKey  = process.env.PRIVATE_KEY; // Must be set
  // The addresses of your deployed contracts:
  const contractAddress = '0x83b8722b4FBc1c40404aaC54c709F8B324e45752'; // DEX
  const oracleAddress   = '0x0dD4BE671009F039cEfc4a3AC25b68Ef2E40F111'; // Oracle

  const delay = 1.5; // seconds for deposit/withdraw wait times

  if (!privateKey) {
    throw new Error('PRIVATE_KEY environment variable is not set');
  }

  let openOracleIdToPosId  = {};
  let closeOracleIdToPosId = {};

  // ----------------------------------
  // Helper: schedule or immediately call endPosition (with an extra ~ buffer)
  // ----------------------------------
  async function scheduleEndPosition(web3, contract, posId, account) {
    try {
      const EXTRA_DELAY_SEC = 4;
      const positionData    = await contract.methods.positions(posId).call();
      const expectedEnd     = parseInt(positionData.expectedEndTime, 10);
      if (!expectedEnd) {
        console.log(`Position ${posId} has no expectedEndTime. Aborting scheduleEndPosition.`);
        return;
      }
      const latestBlock = await web3.eth.getBlock('latest');
      const currentTs   = parseInt(latestBlock.timestamp, 10);
      const timeLeft    = expectedEnd - currentTs;

      const timeUntil   = timeLeft > 0 ? timeLeft + EXTRA_DELAY_SEC : 0;
      if (timeUntil <= 0) {
        console.log(`endPosition for ${posId} can be called immediately (timeUntil <= 0).`);
        await endPositionNow(contract, posId, account);
      } else {
        console.log(`Scheduling endPosition(${posId}) in ${timeUntil} seconds (expectedEndTime = ${expectedEnd}).`);
        setTimeout(async () => {
          await endPositionNow(contract, posId, account);
        }, timeUntil * 1000);
      }
    } catch (err) {
      console.error(`Error in scheduleEndPosition(${posId}):`, err.message);
    }
  }

  // Actually call endPosition with dynamic gas
  async function endPositionNow(contract, posId, account) {
    console.log(`Attempting endPosition(${posId})...`);
    try {
      // Estimate gas & bump
      const baseGas = await contract.methods.endPosition(posId).estimateGas({
        from: account
      });
      const finalGas = Math.floor(baseGas * 1.2);

      // Bump gas price ~10%
      const recommendedGasPrice = await web3.eth.getGasPrice();
      const bumpedGasPriceBN    = web3.utils.toBN(recommendedGasPrice).muln(110).divn(100);

      const receipt = await contract.methods.endPosition(posId).send({
        from: account,
        gas: finalGas,
        gasPrice: bumpedGasPriceBN.toString()
      });
      console.log(`endPosition(${posId}) success - Tx: ${receipt.transactionHash}`);
    } catch (err) {
      console.error(`endPosition(${posId}) failed:`, err.message);
    }
  }

  function initializeWeb3() {
    const provider = new Web3.providers.WebsocketProvider(providerUrl);
    const web3     = new Web3(provider);

    provider.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
    provider.on('end', () => {
      console.log('WebSocket disconnected, attempting to reconnect...');
      setTimeout(initializeWeb3, 5000);
    });
    provider.on('connect', () => {
      console.log('WebSocket connected to Arbitrum');
    });

    web3.eth.accounts.wallet.add(privateKey);
    const account = web3.eth.accounts.wallet[0].address;

    const contract       = new web3.eth.Contract(contractAbi, contractAddress);
    const oracleContract = new web3.eth.Contract(oracleAbi, oracleAddress);

    // Reusable function to dynamically send tx for deposit/withdraw/etc
    async function sendTransactionDynamically(methodCall) {
      // Estimate gas
      const baseGas = await methodCall.estimateGas({ from: account });
      const finalGas = Math.floor(baseGas * 1.2);

      // Bump gas price
      const recommendedGasPrice = await web3.eth.getGasPrice();
      const bumpedGasPriceBN    = web3.utils.toBN(recommendedGasPrice).muln(110).divn(100);

      return methodCall.send({
        from: account,
        gas: finalGas,
        gasPrice: bumpedGasPriceBN.toString()
      });
    }

    // ----------------------------------
    // DEX EVENTS
    // ----------------------------------

    // newDeposit -> schedule settleDepositor
    contract.events.newDeposit({
      fromBlock: 'latest',
      includeRemoved: false
    }, (error, event) => {
      if (error) {
        console.error('Error on newDeposit event:', error);
        return;
      }
      const { depositId, waitTimeDeposit } = event.returnValues;
      const baseDelay = parseInt(waitTimeDeposit, 10) + delay;
      const extraSec  = parseInt(waitTimeDeposit, 10) > 0 ? 1 : 0;
      const waitMs    = (baseDelay + extraSec) * 1000;

      console.log(`New deposit #${depositId}, scheduling settleDepositor in ~${baseDelay + extraSec} secs`);

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
    });

    // newWithdrawal -> schedule settleWithdraw
    contract.events.newWithdrawal({
      fromBlock: 'latest',
      includeRemoved: false
    }, (error, event) => {
      if (error) {
        console.error('Error on newWithdrawal event:', error);
        return;
      }
      const { withdrawId, waitTimeWithdraw } = event.returnValues;
      const baseDelay = parseInt(waitTimeWithdraw, 10) + delay;
      const extraSec  = parseInt(waitTimeWithdraw, 10) > 0 ? 1 : 0;
      const waitMs    = (baseDelay + extraSec) * 1000;

      console.log(`New withdrawal #${withdrawId}, scheduling settleWithdraw in ~${baseDelay + extraSec} secs`);

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
    });

    contract.events.positionOpenRequest({
      fromBlock: 'latest',
      includeRemoved: false
    }, async (error, event) => {
      if (error) {
        console.error('Error on positionOpenRequest event:', error);
        return;
      }
      const { positionId } = event.returnValues;
      console.log(`positionOpenRequest for posId = ${positionId}. Fetching openOracleId...`);

      try {
        const pos          = await contract.methods.positions(positionId).call();
        const openOracleId = pos.openOracleId;
        openOracleIdToPosId[openOracleId] = positionId;
        console.log(`Mapped openOracleId ${openOracleId} -> posId ${positionId}`);
      } catch (err) {
        console.error(`Error reading position ${positionId}:`, err.message);
      }
    });

    contract.events.endPositionStarted({
      fromBlock: 'latest',
      includeRemoved: false
    }, async (error, event) => {
      if (error) {
        console.error('Error on endPositionStarted event:', error);
        return;
      }
      const { posId } = event.returnValues;
      console.log(`endPositionStarted for posId = ${posId}. Fetching closeOracleId...`);

      try {
        const pos           = await contract.methods.positions(posId).call();
        const closeOracleId = pos.closeOracleId;
        closeOracleIdToPosId[closeOracleId] = posId;
        console.log(`Mapped closeOracleId ${closeOracleId} -> posId ${posId}`);
      } catch (err) {
        console.error(`Error reading position ${posId}:`, err.message);
      }
    });

    // ----------------------------------
    // ORACLE EVENTS
    // ----------------------------------
    oracleContract.events.ReportSettled({
      fromBlock: 'latest',
      includeRemoved: false
    }, async (error, event) => {
      if (error) {
        console.error('Error on ReportSettled event:', error);
        return;
      }
      const { reportId } = event.returnValues;
      console.log(`Oracle settled reportId = ${reportId}. Checking if it's open or close...`);

      // If it's the open oracle -> finalize opening + schedule endPosition
      if (openOracleIdToPosId[reportId]) {
        const posId = openOracleIdToPosId[reportId];
        console.log(`Found openOracleId->posId = ${posId}, calling settleOpen(${posId})...`);
        try {
          const receipt = await (async () => {
            // dynamic approach for settleOpen
            const methodCall = contract.methods.settleOpen(posId);
            const baseGas    = await methodCall.estimateGas({ from: account });
            const finalGas   = Math.floor(baseGas * 1.2);

            const recommendedGasPrice = await web3.eth.getGasPrice();
            const bumpedGasPriceBN    = web3.utils.toBN(recommendedGasPrice).muln(110).divn(100);

            return methodCall.send({
              from: account,
              gas: finalGas,
              gasPrice: bumpedGasPriceBN.toString()
            });
          })();

          console.log(`Settled open for posId ${posId} - Tx: ${receipt.transactionHash}`);
          await scheduleEndPosition(web3, contract, posId, account);

          delete openOracleIdToPosId[reportId];
        } catch (err) {
          console.error(`Error in settleOpen(${posId}):`, err.message);
        }
      }
      // If it's the close oracle -> finalize closing
      else if (closeOracleIdToPosId[reportId]) {
        const posId = closeOracleIdToPosId[reportId];
        console.log(`Found closeOracleId->posId = ${posId}, calling finalizeEndPosition(${posId})...`);
        try {
          // dynamic approach for finalizeEndPosition
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
          console.log(`Finalized end for posId ${posId} - Tx: ${receipt.transactionHash}`);
          delete closeOracleIdToPosId[reportId];
        } catch (err) {
          console.error(`Error in finalizeEndPosition(${posId}):`, err.message);
        }
      } else {
        console.log(`No mapping found for reportId = ${reportId}, ignoring.`);
      }
    });

    return { web3, contract };
  }

  // Start the bot
  const { web3 } = initializeWeb3();
  console.log('Settler bot started, listening for events on Arbitrum...');

  // Keep the websocket alive by calling getBlockNumber
  setInterval(async () => {
    try {
      const blk = await web3.eth.getBlockNumber();
      // console.log(`Keep-alive check: block #${blk}`);
    } catch (err) {
      console.error('Keep-alive check failed:', err);
    }
  }, 30000);

  // Prevent the process from exiting
  setInterval(() => {
    // no-op
  }, 60000);

  // Handle uncaught rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
}

// Run main
main().catch((error) => {
  console.error('Bot failed to start:', error);
  process.exit(1);
});