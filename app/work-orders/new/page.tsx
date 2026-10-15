import type { Metadata } from 'next';
import { WorkOrderForm } from '@/components/WorkOrderForm';

export const metadata: Metadata = { title: 'New work order' };

export default function NewWorkOrderPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">New work order</h1>
      <WorkOrderForm mode="create" />
    </>
  );
}
