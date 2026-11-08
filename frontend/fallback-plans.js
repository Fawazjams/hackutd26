// AUTO-GENERATED snapshot of real backend responses, used only when the API is unreachable.
// Regenerate: cd backend && .venv/bin/python scripts/make_fallback.py
export const FALLBACK = {
 "generated": "2026-11-07 (saved from the real backend: GET /backlog, GET /prices?days=7, POST /plan)",
 "backlog": [
  {
   "id": "T1",
   "name": "CRAC-2 compressor replacement",
   "equipment": "CRAC-2",
   "duration_hrs": 6,
   "racks_affected": [
    "B01",
    "B02",
    "B03",
    "B04",
    "B05"
   ],
   "zone": "Z2",
   "risk_growth_per_day": 0.015,
   "allowed_windows": [
    {
     "start_hour": 8,
     "end_hour": 168
    }
   ]
  },
  {
   "id": "T2",
   "name": "PDU breaker swaps, row B",
   "equipment": "PDU row B",
   "duration_hrs": 4,
   "racks_affected": [
    "B06",
    "B07",
    "B08",
    "B09",
    "B10"
   ],
   "zone": "Z2",
   "risk_growth_per_day": 0.01,
   "allowed_windows": [
    {
     "start_hour": 0,
     "end_hour": 168
    }
   ]
  },
  {
   "id": "T3",
   "name": "GPU firmware rollout",
   "equipment": "GPU firmware",
   "duration_hrs": 3,
   "racks_affected": [
    "A01",
    "A02",
    "A03",
    "A04",
    "A05",
    "A06",
    "A07",
    "A08"
   ],
   "zone": "Z1",
   "risk_growth_per_day": 0.005,
   "allowed_windows": [
    {
     "start_hour": 0,
     "end_hour": 168
    }
   ]
  },
  {
   "id": "T4",
   "name": "UPS battery test",
   "equipment": "UPS-A",
   "duration_hrs": 2,
   "racks_affected": [
    "D01",
    "D02",
    "D03",
    "D04",
    "D05",
    "D06",
    "D07",
    "D08",
    "D09",
    "D10"
   ],
   "zone": "Z4",
   "risk_growth_per_day": 0.02,
   "allowed_windows": [
    {
     "start_hour": 32,
     "end_hour": 41
    },
    {
     "start_hour": 80,
     "end_hour": 89
    }
   ]
  },
  {
   "id": "T5",
   "name": "Fiber re-cabling",
   "equipment": "Fiber spine 4",
   "duration_hrs": 5,
   "racks_affected": [
    "D03",
    "D04",
    "D05",
    "D06",
    "D07"
   ],
   "zone": "Z4",
   "risk_growth_per_day": 0.008,
   "allowed_windows": [
    {
     "start_hour": 0,
     "end_hour": 168
    }
   ]
  },
  {
   "id": "T6",
   "name": "CDU coolant flush",
   "equipment": "CDU-3",
   "duration_hrs": 4,
   "racks_affected": [
    "C05",
    "C06",
    "C07",
    "C08"
   ],
   "zone": "Z3",
   "risk_growth_per_day": 0.012,
   "allowed_windows": [
    {
     "start_hour": 8,
     "end_hour": 20
    },
    {
     "start_hour": 32,
     "end_hour": 44
    },
    {
     "start_hour": 56,
     "end_hour": 68
    },
    {
     "start_hour": 80,
     "end_hour": 92
    },
    {
     "start_hour": 104,
     "end_hour": 116
    }
   ]
  }
 ],
 "prices": [
  {
   "day": 0,
   "date": "2026-11-09",
   "gpu": "H100",
   "price": 4.161,
   "low": 3.8989,
   "high": 4.4406,
   "source": "GetDeploying GPU price dataset (weekly, ON_DEMAND median across providers)",
   "as_of": "2026-11-02"
  },
  {
   "day": 1,
   "date": "2026-11-10",
   "gpu": "H100",
   "price": 4.1808,
   "low": 3.8999,
   "high": 4.4818,
   "source": "GetDeploying GPU price dataset (weekly, ON_DEMAND median across providers)",
   "as_of": "2026-11-02"
  },
  {
   "day": 2,
   "date": "2026-11-11",
   "gpu": "H100",
   "price": 4.2005,
   "low": 3.9019,
   "high": 4.5221,
   "source": "GetDeploying GPU price dataset (weekly, ON_DEMAND median across providers)",
   "as_of": "2026-11-02"
  },
  {
   "day": 3,
   "date": "2026-11-12",
   "gpu": "H100",
   "price": 4.2203,
   "low": 3.9047,
   "high": 4.5615,
   "source": "GetDeploying GPU price dataset (weekly, ON_DEMAND median across providers)",
   "as_of": "2026-11-02"
  },
  {
   "day": 4,
   "date": "2026-11-13",
   "gpu": "H100",
   "price": 4.2401,
   "low": 3.9081,
   "high": 4.6003,
   "source": "GetDeploying GPU price dataset (weekly, ON_DEMAND median across providers)",
   "as_of": "2026-11-02"
  },
  {
   "day": 5,
   "date": "2026-11-14",
   "gpu": "H100",
   "price": 4.2599,
   "low": 3.9121,
   "high": 4.6386,
   "source": "GetDeploying GPU price dataset (weekly, ON_DEMAND median across providers)",
   "as_of": "2026-11-02"
  },
  {
   "day": 6,
   "date": "2026-11-15",
   "gpu": "H100",
   "price": 4.2797,
   "low": 3.9166,
   "high": 4.6763,
   "source": "GetDeploying GPU price dataset (weekly, ON_DEMAND median across providers)",
   "as_of": "2026-11-02"
  }
 ],
 "plans": {
  "cloud": {
   "optimized": {
    "mode": "cloud",
    "strategy": "optimized",
    "total_cost": 18222.79,
    "items": [
     {
      "task_id": "T5",
      "name": "Fiber re-cabling",
      "zone": "Z4",
      "start_hour": 3,
      "end_hour": 8,
      "start_label": "Mon 03:00",
      "end_label": "Mon 08:00",
      "gpus_offline": 160,
      "downtime_cost": 3087.79,
      "sla_cost": 216.15,
      "risk_cost": 8.92,
      "total": 3312.86
     },
     {
      "task_id": "T2",
      "name": "PDU breaker swaps, row B",
      "zone": "Z2",
      "start_hour": 4,
      "end_hour": 8,
      "start_label": "Mon 04:00",
      "end_label": "Mon 08:00",
      "gpus_offline": 160,
      "downtime_cost": 2463.98,
      "sla_cost": 172.48,
      "risk_cost": 11.91,
      "total": 2648.36
     },
     {
      "task_id": "T3",
      "name": "GPU firmware rollout",
      "zone": "Z1",
      "start_hour": 4,
      "end_hour": 7,
      "start_label": "Mon 04:00",
      "end_label": "Mon 07:00",
      "gpus_offline": 256,
      "downtime_cost": 2957.04,
      "sla_cost": 206.99,
      "risk_cost": 7.14,
      "total": 3171.18
     },
     {
      "task_id": "T1",
      "name": "CRAC-2 compressor replacement",
      "zone": "Z2",
      "start_hour": 8,
      "end_hour": 14,
      "start_label": "Mon 08:00",
      "end_label": "Mon 14:00",
      "gpus_offline": 160,
      "downtime_cost": 3743.57,
      "sla_cost": 262.05,
      "risk_cost": 53.32,
      "total": 4058.94
     },
     {
      "task_id": "T6",
      "name": "CDU coolant flush",
      "zone": "Z3",
      "start_hour": 13,
      "end_hour": 17,
      "start_label": "Mon 13:00",
      "end_label": "Mon 17:00",
      "gpus_offline": 128,
      "downtime_cost": 2006.87,
      "sla_cost": 140.48,
      "risk_cost": 36.9,
      "total": 2184.25
     },
     {
      "task_id": "T4",
      "name": "UPS battery test",
      "zone": "Z4",
      "start_hour": 33,
      "end_hour": 35,
      "start_label": "Tue 09:00",
      "end_label": "Tue 11:00",
      "gpus_offline": 320,
      "downtime_cost": 2477.71,
      "sla_cost": 173.44,
      "risk_cost": 196.05,
      "total": 2847.2
     }
    ],
    "unscheduled": [],
    "overheat_cost": 0.0,
    "overheats": []
   },
   "asap": {
    "mode": "cloud",
    "strategy": "asap",
    "total_cost": 31867.4,
    "items": [
     {
      "task_id": "T1",
      "name": "CRAC-2 compressor replacement",
      "zone": "Z2",
      "start_hour": 9,
      "end_hour": 15,
      "start_label": "Mon 09:00",
      "end_label": "Mon 15:00",
      "gpus_offline": 160,
      "downtime_cost": 3747.56,
      "sla_cost": 262.33,
      "risk_cost": 59.96,
      "total": 4069.86
     },
     {
      "task_id": "T3",
      "name": "GPU firmware rollout",
      "zone": "Z1",
      "start_hour": 9,
      "end_hour": 12,
      "start_label": "Mon 09:00",
      "end_label": "Mon 12:00",
      "gpus_offline": 256,
      "downtime_cost": 2996.45,
      "sla_cost": 209.75,
      "risk_cost": 15.99,
      "total": 3222.2
     },
     {
      "task_id": "T5",
      "name": "Fiber re-cabling",
      "zone": "Z4",
      "start_hour": 9,
      "end_hour": 14,
      "start_label": "Mon 09:00",
      "end_label": "Mon 14:00",
      "gpus_offline": 160,
      "downtime_cost": 3115.76,
      "sla_cost": 218.1,
      "risk_cost": 26.67,
      "total": 3360.53
     },
     {
      "task_id": "T6",
      "name": "CDU coolant flush",
      "zone": "Z3",
      "start_hour": 9,
      "end_hour": 13,
      "start_label": "Mon 09:00",
      "end_label": "Mon 13:00",
      "gpus_offline": 128,
      "downtime_cost": 1994.08,
      "sla_cost": 139.59,
      "risk_cost": 25.61,
      "total": 2159.28
     },
     {
      "task_id": "T2",
      "name": "PDU breaker swaps, row B",
      "zone": "Z2",
      "start_hour": 15,
      "end_hour": 19,
      "start_label": "Mon 15:00",
      "end_label": "Mon 19:00",
      "gpus_offline": 160,
      "downtime_cost": 2519.9,
      "sla_cost": 176.39,
      "risk_cost": 44.27,
      "total": 2740.57
     },
     {
      "task_id": "T4",
      "name": "UPS battery test",
      "zone": "Z4",
      "start_hour": 33,
      "end_hour": 35,
      "start_label": "Tue 09:00",
      "end_label": "Tue 11:00",
      "gpus_offline": 320,
      "downtime_cost": 2477.71,
      "sla_cost": 173.44,
      "risk_cost": 196.05,
      "total": 2847.2
     }
    ],
    "unscheduled": [],
    "overheat_cost": 13467.77,
    "overheats": [
     {
      "hour": 10,
      "zone": "Z3",
      "temp_c": 33.36,
      "gpus_lost": 192,
      "cost": 2883.53
     },
     {
      "hour": 11,
      "zone": "Z2",
      "temp_c": 32.28,
      "gpus_lost": 160,
      "cost": 2423.46
     },
     {
      "hour": 11,
      "zone": "Z3",
      "temp_c": 34.32,
      "gpus_lost": 192,
      "cost": 2908.15
     },
     {
      "hour": 12,
      "zone": "Z2",
      "temp_c": 32.66,
      "gpus_lost": 160,
      "cost": 2387.56
     },
     {
      "hour": 12,
      "zone": "Z3",
      "temp_c": 34.8,
      "gpus_lost": 192,
      "cost": 2865.07
     }
    ]
   }
  },
  "private": {
   "optimized": {
    "mode": "private",
    "strategy": "optimized",
    "total_cost": 17030.64,
    "items": [
     {
      "task_id": "T5",
      "name": "Fiber re-cabling",
      "zone": "Z4",
      "start_hour": 3,
      "end_hour": 8,
      "start_label": "Mon 03:00",
      "end_label": "Mon 08:00",
      "gpus_offline": 160,
      "downtime_cost": 3087.79,
      "sla_cost": 0.0,
      "risk_cost": 8.34,
      "total": 3096.13
     },
     {
      "task_id": "T2",
      "name": "PDU breaker swaps, row B",
      "zone": "Z2",
      "start_hour": 4,
      "end_hour": 8,
      "start_label": "Mon 04:00",
      "end_label": "Mon 08:00",
      "gpus_offline": 160,
      "downtime_cost": 2463.98,
      "sla_cost": 0.0,
      "risk_cost": 11.13,
      "total": 2475.11
     },
     {
      "task_id": "T3",
      "name": "GPU firmware rollout",
      "zone": "Z1",
      "start_hour": 4,
      "end_hour": 7,
      "start_label": "Mon 04:00",
      "end_label": "Mon 07:00",
      "gpus_offline": 256,
      "downtime_cost": 2957.04,
      "sla_cost": 0.0,
      "risk_cost": 6.68,
      "total": 2963.72
     },
     {
      "task_id": "T1",
      "name": "CRAC-2 compressor replacement",
      "zone": "Z2",
      "start_hour": 8,
      "end_hour": 14,
      "start_label": "Mon 08:00",
      "end_label": "Mon 14:00",
      "gpus_offline": 160,
      "downtime_cost": 3743.57,
      "sla_cost": 0.0,
      "risk_cost": 49.84,
      "total": 3793.4
     },
     {
      "task_id": "T6",
      "name": "CDU coolant flush",
      "zone": "Z3",
      "start_hour": 13,
      "end_hour": 17,
      "start_label": "Mon 13:00",
      "end_label": "Mon 17:00",
      "gpus_offline": 128,
      "downtime_cost": 2006.87,
      "sla_cost": 0.0,
      "risk_cost": 34.49,
      "total": 2041.35
     },
     {
      "task_id": "T4",
      "name": "UPS battery test",
      "zone": "Z4",
      "start_hour": 33,
      "end_hour": 35,
      "start_label": "Tue 09:00",
      "end_label": "Tue 11:00",
      "gpus_offline": 320,
      "downtime_cost": 2477.71,
      "sla_cost": 0.0,
      "risk_cost": 183.22,
      "total": 2660.93
     }
    ],
    "unscheduled": [],
    "overheat_cost": 0.0,
    "overheats": []
   },
   "asap": {
    "mode": "private",
    "strategy": "asap",
    "total_cost": 29782.62,
    "items": [
     {
      "task_id": "T1",
      "name": "CRAC-2 compressor replacement",
      "zone": "Z2",
      "start_hour": 9,
      "end_hour": 15,
      "start_label": "Mon 09:00",
      "end_label": "Mon 15:00",
      "gpus_offline": 160,
      "downtime_cost": 3747.56,
      "sla_cost": 0.0,
      "risk_cost": 56.04,
      "total": 3803.61
     },
     {
      "task_id": "T3",
      "name": "GPU firmware rollout",
      "zone": "Z1",
      "start_hour": 9,
      "end_hour": 12,
      "start_label": "Mon 09:00",
      "end_label": "Mon 12:00",
      "gpus_offline": 256,
      "downtime_cost": 2996.45,
      "sla_cost": 0.0,
      "risk_cost": 14.95,
      "total": 3011.4
     },
     {
      "task_id": "T5",
      "name": "Fiber re-cabling",
      "zone": "Z4",
      "start_hour": 9,
      "end_hour": 14,
      "start_label": "Mon 09:00",
      "end_label": "Mon 14:00",
      "gpus_offline": 160,
      "downtime_cost": 3115.76,
      "sla_cost": 0.0,
      "risk_cost": 24.93,
      "total": 3140.69
     },
     {
      "task_id": "T6",
      "name": "CDU coolant flush",
      "zone": "Z3",
      "start_hour": 9,
      "end_hour": 13,
      "start_label": "Mon 09:00",
      "end_label": "Mon 13:00",
      "gpus_offline": 128,
      "downtime_cost": 1994.08,
      "sla_cost": 0.0,
      "risk_cost": 23.93,
      "total": 2018.02
     },
     {
      "task_id": "T2",
      "name": "PDU breaker swaps, row B",
      "zone": "Z2",
      "start_hour": 15,
      "end_hour": 19,
      "start_label": "Mon 15:00",
      "end_label": "Mon 19:00",
      "gpus_offline": 160,
      "downtime_cost": 2519.9,
      "sla_cost": 0.0,
      "risk_cost": 41.38,
      "total": 2561.28
     },
     {
      "task_id": "T4",
      "name": "UPS battery test",
      "zone": "Z4",
      "start_hour": 33,
      "end_hour": 35,
      "start_label": "Tue 09:00",
      "end_label": "Tue 11:00",
      "gpus_offline": 320,
      "downtime_cost": 2477.71,
      "sla_cost": 0.0,
      "risk_cost": 183.22,
      "total": 2660.93
     }
    ],
    "unscheduled": [],
    "overheat_cost": 12586.7,
    "overheats": [
     {
      "hour": 10,
      "zone": "Z3",
      "temp_c": 33.36,
      "gpus_lost": 192,
      "cost": 2694.89
     },
     {
      "hour": 11,
      "zone": "Z2",
      "temp_c": 32.28,
      "gpus_lost": 160,
      "cost": 2264.92
     },
     {
      "hour": 11,
      "zone": "Z3",
      "temp_c": 34.32,
      "gpus_lost": 192,
      "cost": 2717.9
     },
     {
      "hour": 12,
      "zone": "Z2",
      "temp_c": 32.66,
      "gpus_lost": 160,
      "cost": 2231.36
     },
     {
      "hour": 12,
      "zone": "Z3",
      "temp_c": 34.8,
      "gpus_lost": 192,
      "cost": 2677.63
     }
    ]
   }
  }
 }
};
