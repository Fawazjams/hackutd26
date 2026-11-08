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
    "total_cost": 12772.56,
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
      "downtime_cost": 2130.92,
      "sla_cost": 149.16,
      "risk_cost": 8.55,
      "total": 2288.64
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
      "downtime_cost": 1684.4,
      "sla_cost": 117.91,
      "risk_cost": 11.41,
      "total": 1813.72
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
      "downtime_cost": 2022.65,
      "sla_cost": 141.59,
      "risk_cost": 6.84,
      "total": 2171.07
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
      "downtime_cost": 1424.57,
      "sla_cost": 99.72,
      "risk_cost": 24.64,
      "total": 1548.92
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
      "downtime_cost": 2614.89,
      "sla_cost": 183.04,
      "risk_cost": 115.48,
      "total": 2913.41
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
      "downtime_cost": 1727.67,
      "sla_cost": 120.94,
      "risk_cost": 188.19,
      "total": 2036.8
     }
    ],
    "unscheduled": []
   },
   "asap": {
    "mode": "cloud",
    "strategy": "asap",
    "total_cost": 13248.58,
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
      "downtime_cost": 2689.31,
      "sla_cost": 188.25,
      "risk_cost": 57.74,
      "total": 2935.3
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
      "downtime_cost": 2147.16,
      "sla_cost": 150.3,
      "risk_cost": 15.4,
      "total": 2312.86
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
      "downtime_cost": 2226.25,
      "sla_cost": 155.84,
      "risk_cost": 25.66,
      "total": 2407.75
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
      "downtime_cost": 1424.57,
      "sla_cost": 99.72,
      "risk_cost": 24.64,
      "total": 1548.92
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
      "downtime_cost": 1835.67,
      "sla_cost": 128.5,
      "risk_cost": 42.77,
      "total": 2006.94
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
      "downtime_cost": 1727.67,
      "sla_cost": 120.94,
      "risk_cost": 188.19,
      "total": 2036.8
     }
    ],
    "unscheduled": []
   }
  },
  "private": {
   "optimized": {
    "mode": "private",
    "strategy": "optimized",
    "total_cost": 11936.97,
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
      "downtime_cost": 2130.92,
      "sla_cost": 0.0,
      "risk_cost": 7.99,
      "total": 2138.91
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
      "downtime_cost": 1684.4,
      "sla_cost": 0.0,
      "risk_cost": 10.66,
      "total": 1695.06
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
      "downtime_cost": 2022.65,
      "sla_cost": 0.0,
      "risk_cost": 6.4,
      "total": 2029.04
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
      "downtime_cost": 1424.57,
      "sla_cost": 0.0,
      "risk_cost": 23.02,
      "total": 1447.59
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
      "downtime_cost": 2614.89,
      "sla_cost": 0.0,
      "risk_cost": 107.93,
      "total": 2722.81
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
      "downtime_cost": 1727.67,
      "sla_cost": 0.0,
      "risk_cost": 175.88,
      "total": 1903.55
     }
    ],
    "unscheduled": []
   },
   "asap": {
    "mode": "private",
    "strategy": "asap",
    "total_cost": 12381.85,
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
      "downtime_cost": 2689.31,
      "sla_cost": 0.0,
      "risk_cost": 53.96,
      "total": 2743.27
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
      "downtime_cost": 2147.16,
      "sla_cost": 0.0,
      "risk_cost": 14.39,
      "total": 2161.55
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
      "downtime_cost": 2226.25,
      "sla_cost": 0.0,
      "risk_cost": 23.98,
      "total": 2250.24
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
      "downtime_cost": 1424.57,
      "sla_cost": 0.0,
      "risk_cost": 23.02,
      "total": 1447.59
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
      "downtime_cost": 1835.67,
      "sla_cost": 0.0,
      "risk_cost": 39.97,
      "total": 1875.65
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
      "downtime_cost": 1727.67,
      "sla_cost": 0.0,
      "risk_cost": 175.88,
      "total": 1903.55
     }
    ],
    "unscheduled": []
   }
  }
 }
};
