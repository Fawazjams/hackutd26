# GPU rental prices (real data)

Source: GetDeploying GPU price dataset, https://getdeploying.com/gpu-price-trends
(`https://getdeploying.com/dataset/gpu-prices/nvidia-{h100,h200,b200}.csv`), downloaded 2026-11-07.

Weekly snapshots, 2025-11-03 to 2026-11-02, across cloud providers. One row per
(date, billing_type, reservation_months) with min/max/median $/GPU-hr and provider counts.
`app/market.py` reads the ON_DEMAND median. This is a snapshot, not a live feed.
