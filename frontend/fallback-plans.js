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
    "total_cost": 17449.11,
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
      "downtime_cost": 2916.69,
      "sla_cost": 204.17,
      "risk_cost": 11.99,
      "total": 3132.86
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
      "downtime_cost": 2305.53,
      "sla_cost": 161.39,
      "risk_cost": 15.99,
      "total": 2482.91
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
      "downtime_cost": 2768.5,
      "sla_cost": 193.79,
      "risk_cost": 9.6,
      "total": 2971.89
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
      "downtime_cost": 1949.88,
      "sla_cost": 136.49,
      "risk_cost": 34.54,
      "total": 2120.91
     },
     {
      "task_id": "T1",
      "name": "CRAC-2 compressor replacement",
      "zone": "Z2",
      "start_hour": 18,
      "end_hour": 24,
      "start_label": "Mon 18:00",
      "end_label": "Tue 00:00",
      "gpus_offline": 160,
      "downtime_cost": 3579.13,
      "sla_cost": 250.54,
      "risk_cost": 161.92,
      "total": 3991.58
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
      "downtime_cost": 2322.52,
      "sla_cost": 162.58,
      "risk_cost": 263.87,
      "total": 2748.96
     }
    ],
    "unscheduled": []
   },
   "asap": {
    "mode": "cloud",
    "strategy": "asap",
    "total_cost": 18100.63,
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
      "downtime_cost": 3680.99,
      "sla_cost": 257.67,
      "risk_cost": 80.96,
      "total": 4019.62
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
      "downtime_cost": 2938.93,
      "sla_cost": 205.73,
      "risk_cost": 21.59,
      "total": 3166.25
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
      "downtime_cost": 3047.18,
      "sla_cost": 213.3,
      "risk_cost": 35.98,
      "total": 3296.47
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
      "downtime_cost": 1949.88,
      "sla_cost": 136.49,
      "risk_cost": 34.54,
      "total": 2120.91
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
      "downtime_cost": 2512.58,
      "sla_cost": 175.88,
      "risk_cost": 59.97,
      "total": 2748.43
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
      "downtime_cost": 2322.52,
      "sla_cost": 162.58,
      "risk_cost": 263.87,
      "total": 2748.96
     }
    ],
    "unscheduled": []
   }
  },
  "private": {
   "optimized": {
    "mode": "private",
    "strategy": "optimized",
    "total_cost": 16307.58,
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
      "downtime_cost": 2916.69,
      "sla_cost": 0.0,
      "risk_cost": 11.21,
      "total": 2927.9
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
      "downtime_cost": 2305.53,
      "sla_cost": 0.0,
      "risk_cost": 14.95,
      "total": 2320.47
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
      "downtime_cost": 2768.5,
      "sla_cost": 0.0,
      "risk_cost": 8.97,
      "total": 2777.46
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
      "downtime_cost": 1949.88,
      "sla_cost": 0.0,
      "risk_cost": 32.28,
      "total": 1982.16
     },
     {
      "task_id": "T1",
      "name": "CRAC-2 compressor replacement",
      "zone": "Z2",
      "start_hour": 18,
      "end_hour": 24,
      "start_label": "Mon 18:00",
      "end_label": "Tue 00:00",
      "gpus_offline": 160,
      "downtime_cost": 3579.13,
      "sla_cost": 0.0,
      "risk_cost": 151.33,
      "total": 3730.45
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
      "downtime_cost": 2322.52,
      "sla_cost": 0.0,
      "risk_cost": 246.6,
      "total": 2569.12
     }
    ],
    "unscheduled": []
   },
   "asap": {
    "mode": "private",
    "strategy": "asap",
    "total_cost": 16916.48,
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
      "downtime_cost": 3680.99,
      "sla_cost": 0.0,
      "risk_cost": 75.66,
      "total": 3756.65
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
      "downtime_cost": 2938.93,
      "sla_cost": 0.0,
      "risk_cost": 20.18,
      "total": 2959.11
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
      "downtime_cost": 3047.18,
      "sla_cost": 0.0,
      "risk_cost": 33.63,
      "total": 3080.81
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
      "downtime_cost": 1949.88,
      "sla_cost": 0.0,
      "risk_cost": 32.28,
      "total": 1982.16
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
      "downtime_cost": 2512.58,
      "sla_cost": 0.0,
      "risk_cost": 56.05,
      "total": 2568.62
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
      "downtime_cost": 2322.52,
      "sla_cost": 0.0,
      "risk_cost": 246.6,
      "total": 2569.12
     }
    ],
    "unscheduled": []
   }
  }
 }
};
