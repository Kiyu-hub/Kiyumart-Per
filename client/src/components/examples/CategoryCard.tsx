import CategoryCard from '../CategoryCard';
import categoryImage from '@assets/stock_images/Men\'s_fashion_category_image_d439510a.png';

export default function CategoryCardExample() {
  return (
    <div className="p-8 max-w-sm">
      <CategoryCard
        id="men-fashion"
        name="Men's Fashion"
        image={categoryImage}
        productCount={245}
        onClick={(id) => console.log('Category clicked:', id)}
      />
    </div>
  );
}
