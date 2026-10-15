import { randomUUID } from 'node:crypto';
import type { WorkOrder } from '@/lib/api/generated/model';
import { replaceAllOrders } from '@/lib/work-orders/store';

const seeds: Omit<WorkOrder, 'id'>[] = [
  {
    title: 'Replace HVAC filter – Building B',
    description: 'Quarterly swap. Use MERV 13 filters from the supply closet on level 2.',
    priority: 'Medium',
    status: 'Open',
    updatedAt: '2026-10-12T08:15:00.000Z',
  },
  {
    title: 'Inspect rooftop unit 3 for refrigerant leak',
    description: 'Tenant reports warm air on floor 4. Check pressure and sight glass.',
    priority: 'High',
    status: 'In Progress',
    updatedAt: '2026-10-14T13:40:00.000Z',
  },
  {
    title: 'Reset tripped breaker – Panel 4A',
    description: 'Breaker 12 tripped twice this week. Reset and log the load reading.',
    priority: 'High',
    status: 'Done',
    updatedAt: '2026-10-10T16:05:00.000Z',
  },
  {
    title: 'Replace burnt-out stairwell lighting',
    description: 'Stairwell C, levels 2 and 3.',
    priority: 'Low',
    status: 'Open',
    updatedAt: '2026-10-09T09:30:00.000Z',
  },
  {
    title: 'Lubricate loading dock door rollers',
    description: '',
    priority: 'Low',
    status: 'Done',
    updatedAt: '2026-10-05T11:20:00.000Z',
  },
  {
    title: 'Calibrate boiler thermostat – Building A',
    description: 'Setpoint drifts about 3°C above target overnight.',
    priority: 'Medium',
    status: 'In Progress',
    updatedAt: '2026-10-13T07:50:00.000Z',
  },
  {
    title: 'Investigate intermittent elevator door fault',
    description: 'Car 2 door reopens twice before closing. Safety edge sensor suspected.',
    priority: 'High',
    status: 'Open',
    updatedAt: '2026-10-14T17:10:00.000Z',
  },
];

async function main() {
  await replaceAllOrders(seeds.map((seed) => ({ id: randomUUID(), ...seed })));
  const file = process.env.WORK_ORDERS_FILE ?? 'data/work-orders.json';
  console.log(`Seeded ${seeds.length} work orders to ${file} (existing contents overwritten).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
