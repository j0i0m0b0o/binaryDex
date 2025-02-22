// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IOpenOracle {
    function createReportInstance(
        address token1Address,
        address token2Address,
        uint256 exactToken1Report,
        uint256 feePercentage,
        uint256 multiplier,
        uint256 settlementTime
    ) external payable returns (uint256);

    function settle(uint256 reportId) external returns (uint256 price, uint256 settlementTimestamp);
}

contract SimpleBinaryBetDEX is ReentrancyGuard {

    address public constant WETH = 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1; 
    address public constant USDC = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831; 

    uint256 public constant MAX_BET_TIME = 60 * 60; // 1 hour
    uint256 public constant MIN_BET_TIME = 60 * 10; // 10 minutes
    uint256 public constant WIN_NUMERATOR   = 11;
    uint256 public constant WIN_DENOMINATOR = 6;

    IOpenOracle public oracle;

    uint256 public totalPoolShares;
    uint256 public totalPoolETH;
    mapping(address => uint256) public sharesOf;

    struct DepositRequest {
        address user;
        uint256 amountETH;
        uint256 settlerReward;
        uint256 requestTimestamp;
        uint256 waitTime;
        bool settled;
        bool cancelled;
        uint256 longestBetId;
    }

    struct WithdrawRequest {
        address user;
        uint256 shares;
        uint256 settlerReward;
        uint256 requestTimestamp;
        uint256 waitTime;
        bool settled;
        bool cancelled;
        uint256 longestBetId;
    }

    uint256 public nextDepositRequestId = 1;
    uint256 public nextWithdrawRequestId = 1;

    mapping(uint256 => DepositRequest) public depositRequests;
    mapping(uint256 => WithdrawRequest) public withdrawRequests;

    // Prevent overlapping requests for the same user
    mapping(address => bool) public activeRequest;
    mapping(address => bool) public activeTradeRequest;
    
    mapping(address => uint256) public traderToPosId;

    enum PositionState { None, WaitingOpenOracle, Active, WaitingCloseOracle, Closed }

    struct Position {
        address trader;
        bool direction; 
        uint256 sizeETH; 
        uint256 settlerRewardOpen;
        uint256 settlerRewardClose;
        uint256 settlerRewardClose2;
        uint256 closeOracleFee;

        uint256 openOracleId;
        uint256 closeOracleId;
        uint256 openPrice; 
        uint256 stateChangeTimestamp;
        uint256 expectedEndTime;
        
        PositionState state;
    }

    struct Position2 {
        uint256 betTimespan;
        bool refunded;
        bool closed;
    }

    uint256 public nextPositionId = 1;
    mapping(uint256 => Position) public positions;
    mapping(uint256 => Position2) public positions2;

    uint256 public totalLongOI;
    uint256 public totalShortOI;

    uint256 public globalLongestBetEndTime;
    uint256 public globalLongestBetPosId;

    mapping(address => uint256) globalLongestBetPosIDs;

    struct OpenPosParams {
        bool direction;
        uint256 settlerRewardOpen;
        uint256 settlerRewardClose;
        uint256 closeOracleFee;
        uint256 settlerRewardClose2;
        uint256 betTimer;
    }

    constructor(address oracleAddress) {
        oracle = IOpenOracle(oracleAddress);
    }

    event newDeposit(
        uint256 indexed depositId,
        uint256 settlerRewardDeposit,
        uint256 requestTimestamp,
        uint256 waitTimeDeposit
    );

    event depositSettled(uint256 depositId);
    event depositCancelled(uint256 depositId);

    function deposit(uint256 settlerRewardDeposit) external payable nonReentrant {
        require(msg.value > settlerRewardDeposit, "Need ETH > reward");
        require(!activeRequest[msg.sender], "User has active request");

        uint256 depositId = nextDepositRequestId++;
        uint256 waitTimeDeposit = (block.timestamp > globalLongestBetEndTime)
            ? 0
            : (globalLongestBetEndTime - block.timestamp);

        depositRequests[depositId] = DepositRequest({
            user: msg.sender,
            amountETH: msg.value,
            settlerReward: settlerRewardDeposit,
            requestTimestamp: block.timestamp,
            waitTime: waitTimeDeposit,
            settled: false,
            cancelled: false,
            longestBetId: globalLongestBetPosId
        });

        emit newDeposit(depositId, settlerRewardDeposit, block.timestamp, waitTimeDeposit);
        activeRequest[msg.sender] = true;
    }

    uint numActiveTrades = 0;

    function settleDepositor(uint256 depositId) external nonReentrant {
        DepositRequest storage req = depositRequests[depositId];
        Position2 storage q = positions2[req.longestBetId];

        if (numActiveTrades > 0){
        require(q.closed == true);
        }

        require(!req.cancelled, "Deposit cancelled");
        require(!req.settled, "Already settled");
        require(block.timestamp >= (req.requestTimestamp + req.waitTime), "Deposit not ready");

        req.settled = true;

        uint256 depositAmount = req.amountETH - req.settlerReward;
        totalPoolETH += depositAmount;
        sharesOf[req.user] += depositAmount;
        totalPoolShares += depositAmount;

        emit depositSettled(depositId);

        activeRequest[req.user] = false;

        (bool success, ) = payable(msg.sender).call{value: req.settlerReward}("");
        require(success, "Reward transfer fail");

    }

    function cancelDeposit(uint256 depositId) external nonReentrant {
        DepositRequest storage req = depositRequests[depositId];
        require(block.timestamp > req.waitTime + req.requestTimestamp + 30, "Cancel not yet allowed");
        require(!req.cancelled && !req.settled, "Already final");

        req.cancelled = true;
        activeRequest[req.user] = false;
        emit depositCancelled(depositId);

        (bool success, ) = payable(msg.sender).call{value: req.settlerReward}("");
        require(success, "cancelDeposit reward fail");

        (bool success2, ) = payable(req.user).call{value: req.amountETH - req.settlerReward}("");
        require(success2, "cancelDeposit deposit fail");
    }

    event newWithdrawal(
        uint256 indexed withdrawId,
        uint256 settlerRewardDeposit,
        uint256 requestTimestamp,
        uint256 waitTimeWithdraw
    );
    event withdrawSettled(uint256 withdrawId);
    event withdrawalCancelled(uint256 withdrawId);

    function withdraw(uint256 shares) external payable nonReentrant {
        require(sharesOf[msg.sender] >= shares, "Not enough shares");
        require(shares > 0, "Cannot withdraw zero");
        require(!activeRequest[msg.sender], "User has active request");

        uint256 withdrawId = nextWithdrawRequestId++;
        uint256 waitTimeWithdraw = (block.timestamp > globalLongestBetEndTime)
            ? 0
            : (globalLongestBetEndTime - block.timestamp);

        withdrawRequests[withdrawId] = WithdrawRequest({
            user: msg.sender,
            shares: shares,
            settlerReward: msg.value,
            requestTimestamp: block.timestamp,
            waitTime: waitTimeWithdraw,
            settled: false,
            cancelled: false,
            longestBetId: globalLongestBetPosId
        });

        activeRequest[msg.sender] = true;
        emit newWithdrawal(withdrawId, msg.value, block.timestamp, waitTimeWithdraw);
    }

    function settleWithdraw(uint256 withdrawId) external nonReentrant {
        WithdrawRequest storage req = withdrawRequests[withdrawId];
        Position2 storage q = positions2[req.longestBetId];

        if (numActiveTrades > 0){
        require(q.closed == true);
        }

        require(!req.cancelled, "Withdrawal cancelled");
        require(!req.settled, "Already settled");
        require(block.timestamp >= (req.requestTimestamp + req.waitTime), "Withdraw not ready");

        req.settled = true; 

        sharesOf[req.user] -= req.shares;
        uint256 fraction = (req.shares * 1e18) / totalPoolShares;
        uint256 amountETH = (totalPoolETH * fraction) / 1e18;

        require(totalPoolETH > (totalLongOI + totalShortOI), "Pool OI constraint");
        require(amountETH <= (totalPoolETH - totalLongOI - totalShortOI), "Pool OI constraint");

        totalPoolShares -= req.shares;
        totalPoolETH -= amountETH;

        emit withdrawSettled(withdrawId);
        activeRequest[req.user] = false;

        (bool success, ) = payable(msg.sender).call{value: req.settlerReward}("");
        require(success, "Settler reward fail");

        (bool success2, ) = payable(req.user).call{value: amountETH}("");
        require(success2, "Withdraw fail");
    }

    function cancelWithdrawal(uint256 withdrawId) external nonReentrant {
        WithdrawRequest storage req = withdrawRequests[withdrawId];
        require(block.timestamp > req.waitTime + req.requestTimestamp + 30, "Cancel not yet allowed");
        require(!req.cancelled && !req.settled, "Already final");

        req.cancelled = true;
        activeRequest[req.user] = false;
        emit withdrawalCancelled(withdrawId);

        (bool success, ) = payable(msg.sender).call{value: req.settlerReward}("");
        require(success, "cancelWithdraw reward fail");
    }

    event positionOpenRequest(uint256 settlerRewardOpen, uint256 positionId);
    event openSettled(uint256 posId);

    function openPosition(
        bool direction,
        uint256 settlerRewardOpen,
        uint256 settlerRewardClose,
        uint256 closeOracleFee,
        uint256 settlerRewardClose2,
        uint256 betTime
    ) external payable nonReentrant {
        require(!activeTradeRequest[msg.sender], "User has active trade");
        require(betTime <= MAX_BET_TIME && betTime >= MIN_BET_TIME, "Invalid bet time");

        uint256 totalFees = settlerRewardOpen 
                            + settlerRewardClose 
                            + (2 * closeOracleFee)
                            + settlerRewardClose2;
        require(msg.value > totalFees, "Not enough ETH for fees + bet");

        uint256 size = msg.value - totalFees;
        require(size > uint256(25000));
        if (direction) {
            require(totalLongOI + size <= (totalPoolETH / 2), "Long OI cap");
            totalLongOI += size;
        } else {
            require(totalShortOI + size <= (totalPoolETH / 2), "Short OI cap");
            totalShortOI += size;
        }

        uint256 oracleInitSize;

        if (size / 5 < uint256(3636363636363636)){
            oracleInitSize = uint256(3636363636363636);
        }else{
            oracleInitSize = size / 5;
        }
        uint256 openOracleId = oracle.createReportInstance{value: closeOracleFee}(
            WETH,
            USDC,
            oracleInitSize,
            2222,
            115,
            8
        );

        uint256 posId = nextPositionId++;
        positions[posId] = Position({
            trader: msg.sender,
            direction: direction,
            sizeETH: size,
            settlerRewardOpen: settlerRewardOpen,
            settlerRewardClose: settlerRewardClose,
            settlerRewardClose2: settlerRewardClose2,
            closeOracleFee: closeOracleFee,
            openOracleId: openOracleId,
            closeOracleId: 0,
            openPrice: 0,
            stateChangeTimestamp: block.timestamp,
            expectedEndTime: 0,
            state: PositionState.WaitingOpenOracle
        });

        positions2[posId] = Position2({
            betTimespan: betTime,
            refunded: false,
            closed: false
        });

        emit positionOpenRequest(settlerRewardOpen, posId);
        activeTradeRequest[msg.sender] = true;
    }

    function settleOpen(uint256 posId) external nonReentrant {
        Position storage p = positions[posId];
        Position2 storage q = positions2[posId];

        require(p.state == PositionState.WaitingOpenOracle, "Not waitingOpenOracle");
        require(activeTradeRequest[p.trader], "No active trade found");
        require(!q.refunded, "Position refunded");

        (uint256 price, ) = oracle.settle(p.openOracleId);
        require(price > 0, "Oracle not settled yet");

        p.openPrice = 1e50 / price;

        p.state = PositionState.Active;
        p.stateChangeTimestamp = block.timestamp;
        p.expectedEndTime = block.timestamp + q.betTimespan;

        if (p.expectedEndTime > globalLongestBetEndTime) {
            globalLongestBetEndTime = p.expectedEndTime;
            globalLongestBetPosIDs[p.trader] = posId;
            globalLongestBetPosId = posId;
        }

        emit openSettled(posId);
        activeTradeRequest[p.trader] = false;
        numActiveTrades += 1;
        (bool s, ) = payable(msg.sender).call{value: p.settlerRewardOpen}("");
        traderToPosId[p.trader] = posId;
        require(s, "SettlerRewardOpen fail");
    }

    function refundOpenFailure(uint256 posId) external nonReentrant {
        Position storage p = positions[posId];
        Position2 storage q = positions2[posId];

        require(!q.refunded, "Already refunded");
        require(p.state == PositionState.WaitingOpenOracle, "Position not waitingOpenOracle");
        require(block.timestamp > (p.stateChangeTimestamp + 900), "Not timed out yet");

        if (p.direction) {
            totalLongOI -= p.sizeETH;
        } else {
            totalShortOI -= p.sizeETH;
        }
        p.state = PositionState.Closed;

        uint256 refundAmount = p.sizeETH
                             + p.settlerRewardClose 
                             + p.settlerRewardClose2
                             + p.closeOracleFee
                             + p.settlerRewardOpen;

        q.refunded = true;
        activeTradeRequest[p.trader] = false;

        (bool s, ) = payable(p.trader).call{value: refundAmount}("");
        require(s, "Refund fail");

    }

    event endPositionStarted(uint256 posId);
    event endPositionFinalized(uint256 posId);

    function endPosition(uint256 posId) external nonReentrant {
        Position storage p = positions[posId];
        require(p.state == PositionState.Active, "Not active");
        require(block.timestamp > p.expectedEndTime, "Bet time not ended");
        uint256 oracleInitSize;
        if (p.sizeETH / 5 < uint256(3636363636363636)){
            oracleInitSize = uint256(3636363636363636);
        }else{
            oracleInitSize = p.sizeETH / 5;
        }
        uint256 closeId = oracle.createReportInstance{value: p.closeOracleFee}(
            WETH,
            USDC,
            oracleInitSize,
            2222,
            115,
            8
        );

        p.closeOracleId = closeId;
        p.state = PositionState.WaitingCloseOracle;
        p.stateChangeTimestamp = block.timestamp;
        numActiveTrades -= 1;
        (bool success, ) = payable(msg.sender).call{value: p.settlerRewardClose}("");
        require(success, "SettlerRewardClose fail");

        emit endPositionStarted(posId);
    }

    function finalizeEndPosition(uint256 posId) external nonReentrant {
        _finalizeEndPositionLogic(posId);
        emit endPositionFinalized(posId);
    }

    function _finalizeEndPositionLogic(uint256 posId) internal {
        Position storage p = positions[posId];
        Position2 storage q = positions2[posId];

        require(p.state == PositionState.WaitingCloseOracle, "Not waitingCloseOracle");

        (uint256 closePrice_, ) = oracle.settle(p.closeOracleId);
        require(closePrice_ > 0, "Close price not settled");

        (bool success, ) = payable(msg.sender).call{value: p.settlerRewardClose2}("");
        require(success, "SettlerRewardClose2 fail");

        uint256 closePrice = 1e50 / closePrice_;
        bool isWin = (p.direction && closePrice > p.openPrice) 
                    || (!p.direction && closePrice < p.openPrice);

        if (isWin) {
            uint256 payout = (p.sizeETH * WIN_NUMERATOR) / WIN_DENOMINATOR;
            require(payout <= totalPoolETH, "Pool insufficient");
            totalPoolETH -= (payout - p.sizeETH);

            (bool s2, ) = payable(p.trader).call{value: payout}("");
            require(s2, "Trader payout fail");
        } else {
            totalPoolETH += p.sizeETH;
        }

        if (p.direction) {
            totalLongOI -= p.sizeETH;
        } else {
            totalShortOI -= p.sizeETH;
        }
        p.state = PositionState.Closed;
        q.closed = true;
        traderToPosId[p.trader] = 0;
    }

    receive() external payable {}
    fallback() external payable {}
}