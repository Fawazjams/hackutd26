// AUTO-GENERATED snapshot of real backend responses, used only when the API is unreachable.
// Regenerate: run the backend, then re-save GET /backlog, GET /prices?days=7 and POST /plan for
// mode in {cloud, private} x strategy in {optimized, asap}.
export const FALLBACK = {
 "generated": "2026-11-07 (saved from the real backend: GET /backlog, GET /prices?days=7, POST /plan)",
 "backlog": [
  {
   "id": "T1",
   "name": "CRAC-2 compressor replacement",
   "equipment": "CRAC-2",
   "duration_hrs": 6,
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
   "risk_growth_per_day": 0.02,
   "allowed_windows": [
    {
     "start_hour": 0,
     "end_hour": 168
    }
   ]
  },
  {
   "id": "T2",
   "name": "PDU breaker swaps (row B)",
   "equipment": "PDU-B",
   "duration_hrs": 4,
   "racks_affected": [
    "B01",
    "B02",
    "B03",
    "B04",
    "B05",
    "B06"
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
   "name": "GPU firmware rollout (row C)",
   "equipment": "GPU firmware",
   "duration_hrs": 3,
   "racks_affected": [
    "C01",
    "C02",
    "C03",
    "C04",
    "C05",
    "C06",
    "C07",
    "C08",
    "C09",
    "C10"
   ],
   "zone": "Z3",
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
   "name": "UPS-A battery test",
   "equipment": "UPS-A",
   "duration_hrs": 3,
   "racks_affected": [
    "A05",
    "A06",
    "A07",
    "A08",
    "A09",
    "A10"
   ],
   "zone": "Z1",
   "risk_growth_per_day": 0.008,
   "allowed_windows": [
    {
     "start_hour": 32,
     "end_hour": 42
    },
    {
     "start_hour": 80,
     "end_hour": 90
    }
   ]
  },
  {
   "id": "T5",
   "name": "Fiber re-cabling (row D)",
   "equipment": "Fiber trunk D",
   "duration_hrs": 5,
   "racks_affected": [
    "D01",
    "D02",
    "D03",
    "D04"
   ],
   "zone": "Z4",
   "risk_growth_per_day": 0.005,
   "allowed_windows": [
    {
     "start_hour": 0,
     "end_hour": 168
    }
   ]
  },
  {
   "id": "T6",
   "name": "CDU-3 coolant pump seal",
   "equipment": "CDU-3",
   "duration_hrs": 4,
   "racks_affected": [
    "C01",
    "C02",
    "C03",
    "C04"
   ],
   "zone": "Z3",
   "risk_growth_per_day": 0.012,
   "allowed_windows": [
    {
     "start_hour": 0,
     "end_hour": 168
    }
   ]
  }
 ],
 "prices": [
  {
   "day": 0,
   "gpu": "H100",
   "price": 3.04,
   "low": 2.736,
   "high": 3.344
  },
  {
   "day": 1,
   "gpu": "H100",
   "price": 3.11,
   "low": 2.799,
   "high": 3.421
  },
  {
   "day": 2,
   "gpu": "H100",
   "price": 3.22,
   "low": 2.898,
   "high": 3.542
  },
  {
   "day": 3,
   "gpu": "H100",
   "price": 3.15,
   "low": 2.835,
   "high": 3.465
  },
  {
   "day": 4,
   "gpu": "H100",
   "price": 2.93,
   "low": 2.637,
   "high": 3.223
  },
  {
   "day": 5,
   "gpu": "H100",
   "price": 2.78,
   "low": 2.502,
   "high": 3.058
  },
  {
   "day": 6,
   "gpu": "H100",
   "price": 2.84,
   "low": 2.556,
   "high": 3.124
  }
 ],
 "plans": {
  "cloud": {
   "optimized": {
    "mode": "cloud",
    "strategy": "optimized",
    "total_cost": 14351.46,
    "items": [
     {
      "task_id": "T1",
      "name": "CRAC-2 compressor replacement",
      "zone": "Z1",
      "start_hour": 2,
      "end_hour": 8,
      "start_label": "Mon 02:00",
      "end_label": "Mon 08:00",
      "gpus_offline": 256,
      "downtime_cost": 4127.01,
      "sla_cost": 288.89,
      "risk_cost": 27.37,
      "total": 4443.27
     },
     {
      "task_id": "T5",
      "name": "Fiber re-cabling (row D)",
      "zone": "Z4",
      "start_hour": 3,
      "end_hour": 8,
      "start_label": "Mon 03:00",
      "end_label": "Mon 08:00",
      "gpus_offline": 128,
      "downtime_cost": 1704.73,
      "sla_cost": 119.33,
      "risk_cost": 4.28,
      "total": 1828.34
     },
     {
      "task_id": "T2",
      "name": "PDU breaker swaps (row B)",
      "zone": "Z2",
      "start_hour": 4,
      "end_hour": 8,
      "start_label": "Mon 04:00",
      "end_label": "Mon 08:00",
      "gpus_offline": 192,
      "downtime_cost": 2021.28,
      "sla_cost": 141.49,
      "risk_cost": 13.69,
      "total": 2176.46
     },
     {
      "task_id": "T6",
      "name": "CDU-3 coolant pump seal",
      "zone": "Z3",
      "start_hour": 4,
      "end_hour": 8,
      "start_label": "Mon 04:00",
      "end_label": "Mon 08:00",
      "gpus_offline": 128,
      "downtime_cost": 1347.52,
      "sla_cost": 94.33,
      "risk_cost": 10.95,
      "total": 1452.8
     },
     {
      "task_id": "T3",
      "name": "GPU firmware rollout (row C)",
      "zone": "Z3",
      "start_hour": 19,
      "end_hour": 22,
      "start_label": "Mon 19:00",
      "end_label": "Mon 22:00",
      "gpus_offline": 320,
      "downtime_cost": 2502.04,
      "sla_cost": 175.14,
      "risk_cost": 40.63,
      "total": 2717.82
     },
     {
      "task_id": "T4",
      "name": "UPS-A battery test",
      "zone": "Z1",
      "start_hour": 33,
      "end_hour": 36,
      "start_label": "Tue 09:00",
      "end_label": "Tue 12:00",
      "gpus_offline": 192,
      "downtime_cost": 1556.09,
      "sla_cost": 108.93,
      "risk_cost": 67.75,
      "total": 1732.77
     }
    ],
    "unscheduled": []
   },
   "asap": {
    "mode": "cloud",
    "strategy": "asap",
    "total_cost": 15166.06,
    "items": [
     {
      "task_id": "T1",
      "name": "CRAC-2 compressor replacement",
      "zone": "Z1",
      "start_hour": 9,
      "end_hour": 15,
      "start_label": "Mon 09:00",
      "end_label": "Mon 15:00",
      "gpus_offline": 256,
      "downtime_cost": 4302.89,
      "sla_cost": 301.2,
      "risk_cost": 123.18,
      "total": 4727.27
     },
     {
      "task_id": "T2",
      "name": "PDU breaker swaps (row B)",
      "zone": "Z2",
      "start_hour": 9,
      "end_hour": 13,
      "start_label": "Mon 09:00",
      "end_label": "Mon 13:00",
      "gpus_offline": 192,
      "downtime_cost": 2136.85,
      "sla_cost": 149.58,
      "risk_cost": 30.8,
      "total": 2317.23
     },
     {
      "task_id": "T3",
      "name": "GPU firmware rollout (row C)",
      "zone": "Z3",
      "start_hour": 9,
      "end_hour": 12,
      "start_label": "Mon 09:00",
      "end_label": "Mon 12:00",
      "gpus_offline": 320,
      "downtime_cost": 2683.96,
      "sla_cost": 187.88,
      "risk_cost": 19.25,
      "total": 2891.08
     },
     {
      "task_id": "T5",
      "name": "Fiber re-cabling (row D)",
      "zone": "Z4",
      "start_hour": 9,
      "end_hour": 14,
      "start_label": "Mon 09:00",
      "end_label": "Mon 14:00",
      "gpus_offline": 128,
      "downtime_cost": 1781.0,
      "sla_cost": 124.67,
      "risk_cost": 12.83,
      "total": 1918.5
     },
     {
      "task_id": "T6",
      "name": "CDU-3 coolant pump seal",
      "zone": "Z3",
      "start_hour": 12,
      "end_hour": 16,
      "start_label": "Mon 12:00",
      "end_label": "Mon 16:00",
      "gpus_offline": 128,
      "downtime_cost": 1445.19,
      "sla_cost": 101.16,
      "risk_cost": 32.85,
      "total": 1579.2
     },
     {
      "task_id": "T4",
      "name": "UPS-A battery test",
      "zone": "Z1",
      "start_hour": 33,
      "end_hour": 36,
      "start_label": "Tue 09:00",
      "end_label": "Tue 12:00",
      "gpus_offline": 192,
      "downtime_cost": 1556.09,
      "sla_cost": 108.93,
      "risk_cost": 67.75,
      "total": 1732.77
     }
    ],
    "unscheduled": []
   }
  },
  "private": {
   "optimized": {
    "mode": "private",
    "strategy": "optimized",
    "total_cost": 13412.58,
    "items": [
     {
      "task_id": "T1",
      "name": "CRAC-2 compressor replacement",
      "zone": "Z1",
      "start_hour": 2,
      "end_hour": 8,
      "start_label": "Mon 02:00",
      "end_label": "Mon 08:00",
      "gpus_offline": 256,
      "downtime_cost": 4127.01,
      "sla_cost": 0.0,
      "risk_cost": 25.58,
      "total": 4152.59
     },
     {
      "task_id": "T5",
      "name": "Fiber re-cabling (row D)",
      "zone": "Z4",
      "start_hour": 3,
      "end_hour": 8,
      "start_label": "Mon 03:00",
      "end_label": "Mon 08:00",
      "gpus_offline": 128,
      "downtime_cost": 1704.73,
      "sla_cost": 0.0,
      "risk_cost": 4.0,
      "total": 1708.73
     },
     {
      "task_id": "T2",
      "name": "PDU breaker swaps (row B)",
      "zone": "Z2",
      "start_hour": 4,
      "end_hour": 8,
      "start_label": "Mon 04:00",
      "end_label": "Mon 08:00",
      "gpus_offline": 192,
      "downtime_cost": 2021.28,
      "sla_cost": 0.0,
      "risk_cost": 12.79,
      "total": 2034.08
     },
     {
      "task_id": "T6",
      "name": "CDU-3 coolant pump seal",
      "zone": "Z3",
      "start_hour": 4,
      "end_hour": 8,
      "start_label": "Mon 04:00",
      "end_label": "Mon 08:00",
      "gpus_offline": 128,
      "downtime_cost": 1347.52,
      "sla_cost": 0.0,
      "risk_cost": 10.23,
      "total": 1357.76
     },
     {
      "task_id": "T3",
      "name": "GPU firmware rollout (row C)",
      "zone": "Z3",
      "start_hour": 19,
      "end_hour": 22,
      "start_label": "Mon 19:00",
      "end_label": "Mon 22:00",
      "gpus_offline": 320,
      "downtime_cost": 2502.04,
      "sla_cost": 0.0,
      "risk_cost": 37.97,
      "total": 2540.02
     },
     {
      "task_id": "T4",
      "name": "UPS-A battery test",
      "zone": "Z1",
      "start_hour": 33,
      "end_hour": 36,
      "start_label": "Tue 09:00",
      "end_label": "Tue 12:00",
      "gpus_offline": 192,
      "downtime_cost": 1556.09,
      "sla_cost": 0.0,
      "risk_cost": 63.32,
      "total": 1619.41
     }
    ],
    "unscheduled": []
   },
   "asap": {
    "mode": "private",
    "strategy": "asap",
    "total_cost": 14173.89,
    "items": [
     {
      "task_id": "T1",
      "name": "CRAC-2 compressor replacement",
      "zone": "Z1",
      "start_hour": 9,
      "end_hour": 15,
      "start_label": "Mon 09:00",
      "end_label": "Mon 15:00",
      "gpus_offline": 256,
      "downtime_cost": 4302.89,
      "sla_cost": 0.0,
      "risk_cost": 115.12,
      "total": 4418.01
     },
     {
      "task_id": "T2",
      "name": "PDU breaker swaps (row B)",
      "zone": "Z2",
      "start_hour": 9,
      "end_hour": 13,
      "start_label": "Mon 09:00",
      "end_label": "Mon 13:00",
      "gpus_offline": 192,
      "downtime_cost": 2136.85,
      "sla_cost": 0.0,
      "risk_cost": 28.78,
      "total": 2165.63
     },
     {
      "task_id": "T3",
      "name": "GPU firmware rollout (row C)",
      "zone": "Z3",
      "start_hour": 9,
      "end_hour": 12,
      "start_label": "Mon 09:00",
      "end_label": "Mon 12:00",
      "gpus_offline": 320,
      "downtime_cost": 2683.96,
      "sla_cost": 0.0,
      "risk_cost": 17.99,
      "total": 2701.94
     },
     {
      "task_id": "T5",
      "name": "Fiber re-cabling (row D)",
      "zone": "Z4",
      "start_hour": 9,
      "end_hour": 14,
      "start_label": "Mon 09:00",
      "end_label": "Mon 14:00",
      "gpus_offline": 128,
      "downtime_cost": 1781.0,
      "sla_cost": 0.0,
      "risk_cost": 11.99,
      "total": 1792.99
     },
     {
      "task_id": "T6",
      "name": "CDU-3 coolant pump seal",
      "zone": "Z3",
      "start_hour": 12,
      "end_hour": 16,
      "start_label": "Mon 12:00",
      "end_label": "Mon 16:00",
      "gpus_offline": 128,
      "downtime_cost": 1445.19,
      "sla_cost": 0.0,
      "risk_cost": 30.7,
      "total": 1475.89
     },
     {
      "task_id": "T4",
      "name": "UPS-A battery test",
      "zone": "Z1",
      "start_hour": 33,
      "end_hour": 36,
      "start_label": "Tue 09:00",
      "end_label": "Tue 12:00",
      "gpus_offline": 192,
      "downtime_cost": 1556.09,
      "sla_cost": 0.0,
      "risk_cost": 63.32,
      "total": 1619.41
     }
    ],
    "unscheduled": []
   }
  }
 }
};
