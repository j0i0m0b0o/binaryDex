trust minimized binary option dex. users can bet on whether the price of WETH/USDC will be higher or lower than the current price between 10 and 60 minutes in the future. uses openOracle (https://openprices.gitbook.io/openoracle-docs) as the oracle. openOracle is designed to be a trust minimized way to get prices anyone can use

dex settler bot gets paid in settler rewards for settling deposits, withdrawals, open position, and close position transactions.

for the arbitrage loss calculator: type 0,1,GO to run a simulation estimating self-dispute delay arbitrage loss for the binary options dex given certain oracle settings. divides probability space into 100 1% buckets and adds up the expected loss for each bucket. default is 1 hour bet, 5 second settlement time, 2.5 multiplier, 1bps protocol fee, 40% initial oracle report size as % bet size. this ignores house edge as well as free option loss for the self-dispute delayer


DISCLAIMER:
The contract and html file are for research purposes only. Users should be aware they have not been audited and likely contain errors that can lead to the loss of funds. We are using real money to test the economic incentives of the openOracle design.
