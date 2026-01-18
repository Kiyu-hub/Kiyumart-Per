/**
 * Script to fix product image paths in the database
 * Changes @assets/... paths to /attached_assets/...
 */

import { db } from "../db";
import { products } from "../shared/schema";

async function fixImagePaths() {
  console.log("🔧 Fixing product image paths...");
  
  // Get all products
  const allProducts = await db.select().from(products);
  
  let updatedCount = 0;
  
  for (const product of allProducts) {
    if (!product.images || product.images.length === 0) continue;
    
    const hasInvalidPaths = product.images.some(img => img.startsWith("@assets/"));
    
    if (hasInvalidPaths) {
      const fixedImages = product.images.map(img => 
        img.replace(/^@assets\//, "/attached_assets/")
      );
      
      await db.update(products)
        .set({ images: fixedImages })
        .where({ id: product.id } as any);
      
      updatedCount++;
      console.log(`  ✅ Fixed product ${product.id}: ${product.name}`);
    }
  }
  
  console.log(`\n✅ Done! Updated ${updatedCount} products.`);
  process.exit(0);
}

fixImagePaths().catch(err => {
  console.error("Error fixing image paths:", err);
  process.exit(1);
});
