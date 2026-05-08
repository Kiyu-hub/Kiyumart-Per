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
    categoryId: 'cat-1',
    category: 'legacy-category',
    price: '10.00',
    costPrice: '15.00',
    images: [],
    discount: 0,
    stock: 5,
    isActive: true,
    sellerId: 'seller-1',
    storeId: 'store-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any;

  let capturedFilters: any = null;

  storageModule.storage.getProducts = async (filters?: any) => {
    capturedFilters = filters;
    return [product];
  };
  storageModule.storage.getProduct = async (id: string) => id === product.id ? product : undefined;
  storageModule.storage.getProductVariants = async (productId: string) => [] as any[];
  storageModule.storage.getCategory = async (id: string) => id === 'cat-1'
    ? ({ id: 'cat-1', name: 'Electronics', slug: 'electronics', isActive: true } as any)
    : undefined;
  storageModule.storage.getCategories = async (filters?: any) => ([
    { id: 'cat-1', name: 'Electronics', slug: 'electronics', isActive: true },
  ] as any);
  storageModule.storage.getStores = async (filters?: any) => ([
    { id: 'store-1', primarySellerId: 'seller-1', name: 'Primary Store', isActive: true, isApproved: true },
  ] as any);
  storageModule.storage.getUsersByRole = async (role: string) => role === 'seller'
    ? [{ id: 'seller-1', isActive: true, isApproved: true }] as any[]
    : [] as any[];
  storageModule.storage.getPlatformSettings = async () => ({
    isMultiVendor: false,
    primaryStoreId: 'store-1',
    isMaintenanceMode: false,
  } as any);
  storageModule.storage.getStore = async (id?: string) => id === 'store-1'
    ? ({ id: 'store-1', primarySellerId: 'seller-1' } as any)
    : undefined as any;

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
  if (listJson[0].category !== 'electronics' || listJson[0].categoryName !== 'Electronics') {
    throw new Error('GET /api/products did not hydrate category slug/name');
  }
  if (!capturedFilters || capturedFilters.storeId !== 'store-1') {
    throw new Error('GET /api/products did not enforce primary store scope');
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
  if (singleJson.category !== 'electronics' || singleJson.categoryName !== 'Electronics') {
    throw new Error('GET /api/products/:id did not hydrate category slug/name');
  }

  storageModule.storage.getProduct = async (id: string) => id === 'wrong-store'
    ? ({ ...product, id: 'wrong-store', storeId: 'store-2' } as any)
    : undefined;
  const wrongStoreResp = await fetch(`http://localhost:${port}/api/products/wrong-store`);
  if (wrongStoreResp.status !== 404) {
    throw new Error('GET /api/products/:id allowed a product outside the selected single store');
  }

  console.log('✅ products.test passed');
  server.close(() => process.exit(0));
}

run().catch(err => { console.error('❌ products.test failed', err); throw err; });
