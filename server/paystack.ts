import axios from 'axios';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

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
        payload.mobile = data.mobile;
        payload.provider = data.provider;
      }

      const response = await axios.post(`${PAYSTACK_BASE_URL}/transferrecipient`, payload, { headers: buildHeaders(secret), timeout: 20000 });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to create transfer recipient');
    }
  }

  // Initiate a transfer to a recipient
  async initiateTransfer(data: { amountKobo: number; recipient: string; reason?: string }, secret?: string) {
    try {
      const payload = {
        source: 'balance',
        amount: data.amountKobo,
        recipient: data.recipient,
        reason: data.reason || 'Seller payout',
      };
      const response = await axios.post(`${PAYSTACK_BASE_URL}/transfer`, payload, { headers: buildHeaders(secret), timeout: 20000 });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to initiate transfer');
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
