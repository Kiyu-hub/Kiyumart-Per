process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'testsecret';

import express from 'express';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';
import * as storageModule from '../storage';

console.log('running products.test');

async function run() {
  // Mock storage to return a product that includes costPrice
  const product = {
    id: 'prod-1',
    name: 'Test Product',
    description: 'A product for testing',
    price: '10.00',
    costPrice: '15.00',
    images: [],
    discount: 0,
    stock: 5,
    sellerId: 'seller-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any;

  storageModule.storage.getProducts = async (filters?: any) => [product];
  storageModule.storage.getProduct = async (id: string) => id === product.id ? product : undefined;

  const app = express();
  app.use(express.json({ verify: (req: any, _res: any, buf: any) => { req.rawBody = buf; } }));
  app.use(cookieParser());

  const server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  // @ts-ignore
  const port = (server.address() as any).port;

  // Fetch list endpoint
  const listResp = await fetch(`http://localhost:${port}/api/products`);
  const listJson = await listResp.json();
  if (!Array.isArray(listJson) || listJson.length === 0) {
    throw new Error('GET /api/products did not return expected array');
  }
  if (!('costPrice' in listJson[0])) {
    throw new Error('GET /api/products response missing costPrice');
  }
  if (listJson[0].costPrice !== product.costPrice) {
    throw new Error('GET /api/products costPrice value mismatch');
  }

  // Fetch single endpoint
  const singleResp = await fetch(`http://localhost:${port}/api/products/${product.id}`);
  const singleJson = await singleResp.json();
  if (!singleJson || !('costPrice' in singleJson)) {
    throw new Error('GET /api/products/:id response missing costPrice');
  }
  if (singleJson.costPrice !== product.costPrice) {
    throw new Error('GET /api/products/:id costPrice value mismatch');
  }

  console.log('✅ products.test passed');
  server.close();
}

run().catch(err => { console.error('❌ products.test failed', err); throw err; });
