import { storage } from '../server/storage';

async function main() {
  try {
    const prods = await storage.getProducts();
    console.log('Products count:', prods.length);
    for (let i = 0; i < Math.min(5, prods.length); i++) {
      const p = prods[i];
      console.log({ id: p.id, name: p.name, images: p.images?.slice(0, 2) });
    }
  } catch (e) {
    console.error('Error listing products', e);
  }
}

main();
