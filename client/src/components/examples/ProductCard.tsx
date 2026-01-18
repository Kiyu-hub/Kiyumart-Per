import ProductCard from '../ProductCard';
import handbagImage from '@assets/stock_images/Designer_handbag_product_photo_d9f11f99.png';

export default function ProductCardExample() {
  return (
    <div className="p-8 max-w-sm">
      <ProductCard
        id="product-1"
        name="Designer Leather Handbag"
        price={299.99}
        currency="GHS"
        image={handbagImage}
        discount={15}
        rating={4.5}
        reviewCount={128}
        inStock={true}
        onAddToCart={(id) => console.log('Add to cart:', id)}
        onToggleWishlist={(id) => console.log('Toggle wishlist:', id)}
      />
    </div>
  );
}
