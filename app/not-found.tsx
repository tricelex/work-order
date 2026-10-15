import Link from 'next/link';

export default function NotFound() {
  return (
    <section>
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="mt-2">We could not find that page or work order.</p>
      <p className="mt-4">
        <Link href="/" className="underline">
          Back to all work orders
        </Link>
      </p>
    </section>
  );
}
