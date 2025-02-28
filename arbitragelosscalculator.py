import numpy as np
from scipy.stats import levy_stable
import math

# Parameters
alpha_first = 1.6  # Stability parameter for the first simulation
alpha_second = 1.5  # Stability parameter for the second simulation
T = 1200    # Total bet time, T = 1 hour given 5 second settlement period, 1200 5 second periods
scale_factor = T ** (1 / alpha_first)  # Scale factor using alpha_first
oracle_init = 0.4 # initial oracle report size as % bet size
multiplier = 2.5
# Simulation parameters
M = 10000  # Number of paths to simulate
dt = 0.01  # Time step size

def compute_unit_avg(lower_percent, upper_percent, num_samples=1000000, alpha=alpha_first):
    """
    Compute the average of positive stable random variables between lower_percent and upper_percent.
    """
    samples = levy_stable.rvs(alpha=alpha, beta=0, loc=0, scale=1, size=num_samples)
    positive_samples = samples[samples > 0]
    sorted_positive = np.sort(positive_samples)
    lower_index = int(len(sorted_positive) * (lower_percent / 100))
    upper_index = int(len(sorted_positive) * (upper_percent / 100))
    selected_samples = sorted_positive[lower_index:upper_index]
    return np.mean(selected_samples) if len(selected_samples) > 0 else 0

def simulate_one_touch_probability(barrier, M, X, dt, alpha):
    """
    Simulate the one-touch probability of hitting the barrier over [0, X] with given alpha.
    """
    if X <= 0:
        return 0  # No chance of hitting if time is 0 or negative
    num_steps = int(math.ceil(X / dt))
    increments = levy_stable.rvs(alpha=alpha, beta=0, loc=0, scale=dt**(1 / alpha), size=(M, num_steps))
    paths = np.cumsum(increments, axis=1)
    min_paths = np.min(paths, axis=1)
    one_touch = (min_paths <= barrier)
    return np.mean(one_touch) * 100

def solve_for_X(profit_bps):
    """
    Solve for X in: profit_bps = 0.2 * multiplier ^X
    """
    return math.log(profit_bps / oracle_init) / math.log(multiplier) if profit_bps > 0 else 0

def compute_total_pnl(X, profit_bps):
    """
    Compute totalpnl = profit_bps * X - sum_{k=1}^{X} oracle_init * multiplier ^k
    """
    if X <= 0:
        return 0
    k_values = np.arange(1, X + 1)
    sum_cost = oracle_init * np.sum(multiplier ** k_values)
    return profit_bps * X - sum_cost

def compute_ELC(lower_percent, upper_percent, num_samples=1000000):
    """
    Compute the expected loss contribution (ELC) for a given percentile range.
    """
    unit_avg = compute_unit_avg(lower_percent, upper_percent, num_samples)
    scaled_avg = unit_avg * scale_factor
    barrier = -scaled_avg
    prob = simulate_one_touch_probability(barrier, M, X=1.0, dt=dt, alpha=alpha_first)
    profit_bps = prob * 100
    X_real = solve_for_X(profit_bps)
    X = math.floor(X_real) if X_real > 0 else 0
    prob_X = simulate_one_touch_probability(barrier, M, X, dt, alpha=alpha_second)
    range_distance = upper_percent - lower_percent
    return prob_X * 0.5 * (range_distance / 100)

if __name__ == "__main__":
    try:
        # Get input
        input_str = input("Enter the percentile range (e.g., 0,1 or 0,1,GO): ")
        parts = input_str.split(',')
        
        if len(parts) == 3 and parts[2].strip().upper() == "GO":
            # GO mode: Total ELC across all 1% brackets
            total_ELC = sum(compute_ELC(i, i + 1) for i in range(100))
            print(f"Total ELC for all 1% brackets (0-1%, 1-2%, ..., 99-100%): {total_ELC:.2f}%")
        
        elif len(parts) == 2:
            # Standard mode: Metrics for specified range
            lower_percent, upper_percent = map(float, parts)
            if not (0 <= lower_percent < upper_percent <= 100):
                raise ValueError("Invalid range. Use 0 <= lower < upper <= 100.")
            
            unit_avg = compute_unit_avg(lower_percent, upper_percent)
            scaled_avg = unit_avg * scale_factor
            barrier = -scaled_avg
            prob = simulate_one_touch_probability(barrier, M, X=1.0, dt=dt, alpha=alpha_first)
            profit_bps = prob * 100
            X_real = solve_for_X(profit_bps)
            X = math.floor(X_real) if X_real > 0 else 0
            totalpnl = compute_total_pnl(X, profit_bps)
            prob_X = simulate_one_touch_probability(barrier, M, X, dt, alpha=alpha_second)
            range_distance = upper_percent - lower_percent
            ELC = prob_X * 0.5 * (range_distance / 100)
            
            print(f"For the range {lower_percent}% to {upper_percent}% of positive samples:")
            print(f"Unit time average: {unit_avg:.3f}")
            print(f"Scaled average for T = 25^2 = 625: {scaled_avg:.3f}")
            print(f"One-touch probability of hitting barrier = {barrier:.3f} over [0,1]: {prob:.2f}%")
            print(f"Profit per round: {profit_bps:.2f} basis points")
            print(f"Number of rounds X: {X}")
            print(f"Total PNL up to X rounds: {totalpnl:.2f} basis points")
            print(f"One-touch probability of hitting barrier = {barrier:.3f} over [0,{X}]: {prob_X:.2f}%")
            print(f"Range expected loss contribution per bet: {ELC:.2f}%")
        
        else:
            raise ValueError("Invalid input format. Use 'lower,upper' or 'lower,upper,GO'.")
    
    except ValueError as e:
        print(f"Error: {e}. Please enter a valid range like '0,1' or '0,1,GO'.")