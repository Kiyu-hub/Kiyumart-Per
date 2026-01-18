import OrderCard from '../OrderCard';

export default function OrderCardExample() {
  return (
    <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <OrderCard
        orderId="ORD-001"
        customerName="Sarah Johnson"
        items={3}
        total={459.97}
        status="processing"
        deliveryMethod="rider"
        date="Nov 2, 2024"
        onViewDetails={(id) => console.log('View details:', id)}
      />
      <OrderCard
        orderId="ORD-002"
        customerName="Michael Brown"
        items={1}
        total={299.99}
        status="delivering"
        deliveryMethod="bus"
        date="Nov 1, 2024"
        onViewDetails={(id) => console.log('View details:', id)}
      />
      <OrderCard
        orderId="ORD-003"
        customerName="Emma Wilson"
        items={2}
        total={179.98}
        status="delivered"
        deliveryMethod="pickup"
        date="Oct 30, 2024"
        onViewDetails={(id) => console.log('View details:', id)}
      />
    </div>
  );
}
