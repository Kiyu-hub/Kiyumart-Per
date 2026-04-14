import axios from 'axios';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';
const GHANA_MOBILE_MONEY_PROVIDER_MAP: Record<string, string> = {
  mtn: 'mtn',
  mtn_mobile_money: 'mtn',
  vod: 'vod',
  vodafone: 'vod',
  telecel: 'vod',
  telecel_cash: 'vod',
  vodafone_cash: 'vod',
  atl: 'atl',
  atm: 'atl',
  airteltigo: 'atl',
  airtel_tigo: 'atl',
  airteltigo_money: 'atl',
};
const GHANA_MOBILE_MONEY_BANK_CODES: Record<string, string> = {
  mtn: 'MTN',
  vod: 'TVL',
  atl: 'ATL',
};
const GHANA_MOBILE_MONEY_PREFIXES: Record<string, string[]> = {
  mtn: ['024', '025', '053', '054', '055', '059'],
  vod: ['020', '050'],
  atl: ['026', '027', '056', '057'],
};

export function normalizeGhanaMobileMoneyProvider(provider?: string | null): string {
  const normalized = String(provider || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return GHANA_MOBILE_MONEY_PROVIDER_MAP[normalized] || '';
}

export function resolveGhanaMobileMoneyBankCode(provider?: string | null): string {
  const normalizedProvider = normalizeGhanaMobileMoneyProvider(provider);
  return GHANA_MOBILE_MONEY_BANK_CODES[normalizedProvider] || '';
}

export function normalizeGhanaMobileMoneyNumber(mobileNumber?: string | null): string {
  const digits = String(mobileNumber || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 9) return `0${digits}`;
  if (digits.length === 10 && digits.startsWith('0')) return digits;
  if (digits.length === 12 && digits.startsWith('233')) return `0${digits.slice(3)}`;
  if (digits.length === 13 && digits.startsWith('2330')) return `0${digits.slice(4)}`;
  return digits;
}

export function isValidGhanaMobileMoneyNumber(mobileNumber?: string | null, provider?: string | null): boolean {
  const normalizedNumber = normalizeGhanaMobileMoneyNumber(mobileNumber);
  if (!/^0\d{9}$/.test(normalizedNumber)) {
    return false;
  }

  const normalizedProvider = normalizeGhanaMobileMoneyProvider(provider);
  if (!normalizedProvider) {
    return false;
  }

  const validPrefixes = GHANA_MOBILE_MONEY_PREFIXES[normalizedProvider];
  if (!validPrefixes?.length) {
    return false;
  }

  return validPrefixes.includes(normalizedNumber.slice(0, 3));
}

interface PaystackSubaccountData {
  business_name: string;
  bank_code: string;
  account_number: string;
  percentage_charge: number;
  description?: string;
  primary_contact_email?: string;
  primary_contact_name?: string;
}

// Build headers dynamically using provided secret or environment variable
function buildHeaders(secret?: string) {
  const key = secret || process.env.PAYSTACK_SECRET_KEY || '';
  return {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

interface PaystackSubaccountResponse {
  status: boolean;
  message: string;
  data: {
    subaccount_code: string;
    business_name: string;
    account_number: string;
    percentage_charge: number;
    settlement_bank: string;
    currency: string;
    id: number;
  };
}

interface PaystackBankListResponse {
  status: boolean;
  message: string;
  data: Array<{
    id: number;
    name: string;
    slug: string;
    code: string;
    longcode: string;
    gateway: string;
    active: boolean;
  }>;
}

interface PaystackAccountVerificationResponse {
  status: boolean;
  message: string;
  data: {
    account_number: string;
    account_name: string;
    bank_id: number;
  };
}

export class PaystackService {
  async createSubaccount(data: PaystackSubaccountData, secret?: string): Promise<PaystackSubaccountResponse> {
    try {
      const response = await axios.post<PaystackSubaccountResponse>(
        `${PAYSTACK_BASE_URL}/subaccount`,
        data,
        { headers: buildHeaders(secret), timeout: 20000 }
      );
      return response.data;
    } catch (error: any) {
      // Network or timeout errors
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        throw new Error('Request timed out. Please check your internet connection and try again.');
      }
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new Error('Unable to reach Paystack. Please check your internet connection.');
      }
      
      // Paystack API errors
      const status = error.response?.status;
      const message = error.response?.data?.message;
      
      if (status === 400) {
        // Check for specific Paystack error messages
        if (message?.includes('subaccount already exists') || message?.includes('already exist')) {
          throw new Error('Payment account already set up for this bank account. Contact support if you need to update it.');
        }
        if (message?.includes('invalid account number')) {
          throw new Error('Invalid bank account number. Please verify your account details.');
        }
        throw new Error(message || 'Invalid payment setup data. Please check all fields and try again.');
      }
      if (status === 422) {
        throw new Error('Invalid bank account details. Please verify the account number and bank code.');
      }
      if (status === 429) {
        throw new Error('Too many requests. Please wait a moment and try again.');
      }
      if (status === 401) {
        throw new Error('Payment gateway authentication failed. Please contact support.');
      }
      if (status === 503 || status === 504) {
        throw new Error('Paystack service temporarily unavailable. Please try again in a few minutes.');
      }
      
      throw new Error(message || 'Failed to set up payment account. Please try again or contact support.');
    }
  }

  async getGhanaBanks(secret?: string): Promise<PaystackBankListResponse> {
    try {
      const response = await axios.get<PaystackBankListResponse>(
        `${PAYSTACK_BASE_URL}/bank?country=ghana&type=ghipss`,
        { headers: buildHeaders(secret) }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch banks');
    }
  }

  async verifyAccountNumber(accountNumber: string, bankCode: string, secret?: string): Promise<PaystackAccountVerificationResponse> {
    try {
      const response = await axios.get<PaystackAccountVerificationResponse>(
        `${PAYSTACK_BASE_URL}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
        { headers: buildHeaders(secret), timeout: 15000 }
      );
      return response.data;
    } catch (error: any) {
      // Network or timeout errors
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        throw new Error('Request timed out. Please check your internet connection and try again.');
      }
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new Error('Unable to reach Paystack. Please check your internet connection.');
      }
      
      // Paystack API errors
      const status = error.response?.status;
      const message = error.response?.data?.message;
      
      if (status === 422) {
        throw new Error('Invalid account number or bank code. Please check your details and try again.');
      }
      if (status === 404) {
        throw new Error('Account not found. Please verify the account number and bank are correct.');
      }
      if (status === 429) {
        throw new Error('Too many requests. Please wait a moment and try again.');
      }
      if (status === 401) {
        throw new Error('Payment gateway authentication failed. Please contact support.');
      }
      
      throw new Error(message || 'Could not verify account. Please check the account number and bank details.');
    }
  }

  async initializeTransaction(data: {
    email: string;
    amount: number;
    reference: string;
    subaccount?: string;
    transaction_charge?: number;
    bearer?: 'account' | 'subaccount';
    metadata?: any;
  }, secret?: string) {
    try {
      const response = await axios.post(
        `${PAYSTACK_BASE_URL}/transaction/initialize`,
        data,
        { headers: buildHeaders(secret) }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to initialize transaction');
    }
  }

  async verifyTransaction(reference: string, secret?: string) {
    try {
      const response = await axios.get(
        `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
        { headers: buildHeaders(secret) }
      );
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to verify transaction');
    }
  }

  // Create transfer recipient for Paystack (supports bank and mobile money)
  async createTransferRecipient(data: {
    type: 'nuban' | 'mobile_money' | 'bank_account' | string;
    name: string;
    account_number?: string;
    bank_code?: string;
    currency?: string;
    mobile?: string;
    provider?: string;
  }, secret?: string) {
    try {
      const payload: any = {
        type: data.type,
        name: data.name,
        currency: data.currency || 'GHS',
      };
      if (data.type === 'nuban' || data.type === 'bank_account') {
        payload.account_number = data.account_number;
        payload.bank_code = data.bank_code;
      }
      if (data.type === 'mobile_money') {
        payload.account_number = data.account_number || data.mobile;
        payload.bank_code = data.bank_code || data.provider;
      }

      const response = await axios.post(`${PAYSTACK_BASE_URL}/transferrecipient`, payload, { headers: buildHeaders(secret), timeout: 20000 });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to create transfer recipient');
    }
  }

  // Initiate a transfer to a recipient
  async initiateTransfer(data: { amountKobo: number; recipient: string; reason?: string; reference?: string }, secret?: string) {
    try {
      const payload = {
        source: 'balance',
        amount: data.amountKobo,
        recipient: data.recipient,
        reason: data.reason || 'Seller payout',
        reference: data.reference,
      };
      const response = await axios.post(`${PAYSTACK_BASE_URL}/transfer`, payload, { headers: buildHeaders(secret), timeout: 20000 });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to initiate transfer');
    }
  }

  async verifyTransfer(reference: string, secret?: string) {
    try {
      const response = await axios.get(
        `${PAYSTACK_BASE_URL}/transfer/verify/${reference}`,
        { headers: buildHeaders(secret), timeout: 20000 }
      );
      return response.data;
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to verify transfer';
      const err: any = new Error(message);
      if (error.response?.status === 404 || /not found/i.test(message)) {
        err.code = 'TRANSFER_NOT_FOUND';
      }
      throw err;
    }
  }

  verifyWebhookSignature(payload: string, signature: string, secret?: string): boolean {
    const crypto = require('crypto');
    const key = secret || process.env.PAYSTACK_SECRET_KEY || '';
    const hash = crypto
      .createHmac('sha512', key)
      .update(payload)
      .digest('hex');
    return hash === signature;
  }
}

export const paystackService = new PaystackService();
