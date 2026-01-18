import CartSidebar from '../CartSidebar';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import handbagImage from '@assets/stock_images/Designer_handbag_product_photo_d9f11f99.png';
import sneakersImage from '@assets/stock_images/Men\'s_sneakers_product_photo_2c87b833.png';

export default function CartSidebarExample() {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState([
    {
      id: '1',
      name: 'Designer Leather Handbag',
      price: 299.99,
      quantity: 1,
      image: handbagImage
    },
    {
      id: '2',
      name: "Men's Casual Sneakers",
      price: 89.99,
      quantity: 2,
      image: sneakersImage
    }
  ]);

  const handleUpdateQuantity = (id: string, quantity: number) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, quantity } : item
    ));
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  return (
    <div className="p-8">
      <Button onClick={() => setIsOpen(true)}>Open Cart</Button>
      <CartSidebar
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        items={items}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onCheckout={() => console.log('Checkout clicked')}
      />
    </div>
  );
}
